/-
  CurvedCorpus.lean
  Machine-checked invariants for the curved-corpus program.
  Companion to: "The Curved-Corpus Program, Unified" (Tchatalbachian, 2026-08-13).

  Core Lean 4 only: no mathlib, no external dependencies.
  Every `theorem` below is closed (no `sorry`).

  Contents (matching Section 6 of the paper):
    1. atom_delta_nonneg      -- Lemma 1: geodesic-only atom has Δ ≥ 0
    2. corpus_sum_nonneg      -- Theorem 1: linear composition preserves Δ ≥ 0
    3. cumulative_monotone    -- Corollary 1: running total is monotone
    4. gate_rank_identity     -- the V₂ gate is a rank test (0.40 threshold as 2/5)
    5. phi_ladder_telescope   -- fold-ladder potential drops telescope
    6. heat_exponent_monotone / heat_exponent_additive -- ℓ(ℓ+1) heat-kernel exponent facts
    7. mh_flux_symm           -- Metropolis flux min-symmetry (detailed balance kernel)
    8. trade_preserves_rowSum / trade_preserves_colSum -- curveball trades stay on the fixed-margin fibre
    9. trade_reversible / uniform_inflow_constant -- F3 null canonicity mechanics (reversibility, uniform stationarity)
    10. stationary_unique_uniform -- Full theorem (F3 capstone): a stationary
        weight vector of an irreducible symmetric kernel is constant, so
        uniform is the unique stationary law on the fibre
    11. mp / catalan / mp_rowsum_eq_catalan -- MP/Narayana moment skeleton
        of the Lyu-Mukherjee anchor: Narayana rows and Catalan row sums as
        exact kernel-checked identities (the limit itself stays cited)
    12. bpow_add / level_double / level_injective -- the decibel laws:
        exact level arithmetic behind the dBc corpus-level scale
        (claim 8, tools/corpus-sonometer)
    13. zernikeR / zernikeR_gen_* / zernikeR_normalized -- Zernike radial
        polynomials: exact integer coefficients from the binomial closed
        form, normalization R_n^m(1) = 1, parity and degree structure
        (slot 4, refs/zernike-fit-2026-08-24.md)

  Scope — what this file does NOT prove. The theorems below are
  identity-type statements over exact arithmetic (integers, fraction
  pairs). Machine-checking them certifies that the program's identities
  carry no empirical content — nothing more. In particular this file does
  not prove:
    • that the selected null ensemble (fixed-margin / curveball) is
      scientifically adequate for the corpus questions asked of it;
    • that any Monte Carlo calibration (null tables, mixing, power
      sweeps) has converged sufficiently;
    • that any numerical spherical heat-kernel implementation is
      error-free (G1's simulations are measurements, not theorems);
    • that floating-point execution of the shipped Python matches the
      real-number model formalized here;
    • or that any observed corpus-specific effect (e.g. ΔV₂ = +0.0144,
      z = +12.3) is genuine rather than an artifact.
  Those claims live on the measurement side of the identity/measurement
  boundary and are supported only by reproduction scripts and matched
  nulls, per the papers' own discipline.

  Resolution status: the identity-type core of the first item -- the
  curveball move set never leaves the fixed-margin fibre -- is proved in
  section 8 below. Every remaining measurement-side item is executed as a
  seeded PASS/FAIL check by verify_claims.py in this directory, which the
  same CI workflow runs beside this file: sampler uniformity on an
  exhaustively enumerated fibre (1), mixing convergence (2), the spherical
  heat-kernel semigroup identity (3), float-vs-exact-model checks of the
  theorems in this file (4), and reproduction of the corpus effect against
  its curveball null (5), and F3 null canonicity -- exhaustive fibre-graph
  irreducibility plus the constant-margin medium matched against
  destroyed-dependence baselines (6), completing sections 8-9.
-/

namespace CurvedCorpus

/-! ### 0. A hand-rolled integer min (no library dependence) -/

def imin (a b : Int) : Int := if a ≤ b then a else b

theorem imin_comm (a b : Int) : imin a b = imin b a := by
  unfold imin
  split <;> split <;> omega

theorem imin_le_left (a b : Int) : imin a b ≤ a := by
  unfold imin
  split <;> omega

theorem imin_le_right (a b : Int) : imin a b ≤ b := by
  unfold imin
  split <;> omega

/-! ### 1. The single-action atom (Lemma 1)

The atom evaluates a pre-action distance `dpre` and a finite nonempty list
of candidate post-action distances. The geodesic-only criterion selects the
minimum. We model "the atom only fires when some candidate does not increase
the distance" as the hypothesis `h : listMin dpre cands ≤ dpre` — which the
selection rule guarantees whenever the identity flip (distance `dpre` itself)
is among the candidates, and which the deployed atom enforces by construction
(it skips files where every flip increases distance).

Δ := dpre − (selected post distance) ≥ 0. -/

def listMin (d : Int) (cands : List Int) : Int :=
  cands.foldl imin d

theorem listMin_le_init (d : Int) (cands : List Int) :
    listMin d cands ≤ d := by
  unfold listMin
  induction cands generalizing d with
  | nil => exact Int.le_refl d
  | cons c cs ih =>
      have h1 : List.foldl imin (imin d c) cs ≤ imin d c := ih (imin d c)
      have h2 : imin d c ≤ d := imin_le_left d c
      exact Int.le_trans h1 h2

/-- Lemma 1 (atom invariant): when the atom selects the minimizing flip and
    the identity option is available, Δ = dpre − dpost ≥ 0. -/
theorem atom_delta_nonneg (dpre : Int) (cands : List Int) :
    0 ≤ dpre - listMin dpre cands := by
  have h := listMin_le_init dpre cands
  omega

/-! ### 2. Linear composition (Theorem 1) -/

def sumList : List Int → Int
  | [] => 0
  | x :: xs => x + sumList xs

/-- Theorem 1 (linear composition): if every atomic Δ ≥ 0 then the corpus
    total Δ ≥ 0. -/
theorem corpus_sum_nonneg (deltas : List Int)
    (h : ∀ d ∈ deltas, 0 ≤ d) : 0 ≤ sumList deltas := by
  induction deltas with
  | nil => exact Int.le_refl 0
  | cons d ds ih =>
      have hd : 0 ≤ d := h d ((by simp : d ∈ d :: ds))
      have hds : 0 ≤ sumList ds := ih (fun x hx => h x (List.mem_cons_of_mem d hx))
      show 0 ≤ d + sumList ds
      omega

/-! ### 3. Cumulative monotonicity (Corollary 1)

The running total over cycles is the prefix sum of per-cycle Δ's. -/

def prefixSum (deltas : List Int) : Nat → Int
  | 0 => 0
  | n + 1 =>
      match deltas with
      | [] => 0
      | d :: ds => d + prefixSum ds n

/-- Corollary 1 (cumulative monotonicity): with all per-cycle Δ ≥ 0,
    each prefix sum is ≤ the next. -/
theorem cumulative_monotone (deltas : List Int)
    (h : ∀ d ∈ deltas, 0 ≤ d) (n : Nat) :
    prefixSum deltas n ≤ prefixSum deltas (n + 1) := by
  induction n generalizing deltas with
  | zero =>
      cases deltas with
      | nil => simp [prefixSum]
      | cons d ds =>
          have hd : 0 ≤ d := h d ((by simp : d ∈ d :: ds))
          simp [prefixSum]
          omega
  | succ m ih =>
      cases deltas with
      | nil => simp [prefixSum]
      | cons d ds =>
          have hds : ∀ x ∈ ds, 0 ≤ x := fun x hx => h x (List.mem_cons_of_mem d hx)
          have := ih ds hds
          simp [prefixSum]
          omega

/-! ### 4. The gate is a rank test (C2)

V₂ = (λ₁+λ₂)/Σλ ≥ 0.40 with the threshold 0.40 = 2/5, and the shipped
estimator r̂ = 2/V₂ ≤ 5. With V₂ = p/q (p, q > 0), the gate is the fraction
comparison p/q ≥ 2/5 and the rank test is 2q/p ≤ 5. Fraction comparison
a/b ≥ c/d over positive denominators is encoded by cross-multiplication
(fracGe). The equivalence gate ↔ rank is an identity, but the two sides
cross-multiply over *different* denominators (q for the gate, p for the
rank proxy), so each direction genuinely consumes one positivity
hypothesis — that is the entire mathematical content: division by a
positive number preserves order. No empirical fact enters. -/

/-- a/b ≥ c/d over positive denominators, encoded by cross-multiplication. -/
def fracGe (a b c d : Int) : Prop := 0 < b ∧ 0 < d ∧ a * d ≥ c * b

/-- C2 (gate rank identity): with V₂ = p/q (p, q > 0),
    V₂ ≥ 2/5  ↔  r̂ = 2q/p ≤ 5 (stated as 5/1 ≥ 2q/p).
    Forward uses 0 < p, backward uses 0 < q. -/
theorem gate_rank_identity (p q : Int) (hp : 0 < p) (hq : 0 < q) :
    fracGe p q 2 5 ↔ fracGe 5 1 (2 * q) p := by
  constructor
  · intro h
    have h3 := h.2.2
    exact ⟨by omega, hp, by omega⟩
  · intro h
    have h3 := h.2.2
    exact ⟨hq, by omega, by omega⟩

/-! ### 5. The fold ladder telescopes (Section 4 of the 2026-08-12 paper)

Φ is the ladder potential after n folds; per-fold drops sum to the total
drop. Modeled with Φ : Nat → Int and drop k := Φ k − Φ (k+1). -/

def drops (Φ : Nat → Int) : Nat → Int
  | 0 => 0
  | n + 1 => drops Φ n + (Φ n - Φ (n + 1))

/-- The per-fold drops telescope: the sum of the first n drops equals
    Φ 0 − Φ n. Identity, not measurement. -/
theorem phi_ladder_telescope (Φ : Nat → Int) (n : Nat) :
    drops Φ n = Φ 0 - Φ n := by
  induction n with
  | zero => simp [drops]
  | succ m ih =>
      simp [drops, ih]
      omega

/-! ### 6. Heat-kernel exponent facts (Section 5, spherical defocus)

The forward defocus multiplies degree-ℓ energy by exp(−2ℓ(ℓ+1)t). The
exponent e(ℓ) = ℓ(ℓ+1) is strictly ordered in ℓ and additive over
concatenated diffusion times — the two facts G1's Leg-1 check rests on. -/

def heatExp (l : Nat) : Nat := l * (l + 1)

/-- Higher degrees defocus strictly faster: ℓ < ℓ' → e(ℓ) < e(ℓ'). -/
theorem heat_exponent_monotone (l l' : Nat) (h : l < l') :
    heatExp l < heatExp l' := by
  unfold heatExp
  have h1 : l + 1 ≤ l' := h
  have e1 : (l + 1) * (l + 1) = l * (l + 1) + (l + 1) := Nat.succ_mul l (l + 1)
  have e2 : (l + 1) * (l + 1) ≤ l' * (l' + 1) := Nat.mul_le_mul h1 (by omega)
  omega

/-- Semigroup additivity in the exponent: running time s then t multiplies
    energies by exp(−2e(ℓ)s)·exp(−2e(ℓ)t) = exp(−2e(ℓ)(s+t)); at the level
    of the integer-scaled exponent this is distributivity. -/
theorem heat_exponent_additive (l s t : Nat) :
    heatExp l * (s + t) = heatExp l * s + heatExp l * t := by
  exact Nat.mul_add (heatExp l) s t

/-! ### 7. Metropolis flux symmetry (curve-compass ± atom)

The compass atom's stationarity argument needs the detailed-balance kernel:
the flux between states a and b is proportional to min(w a, w b), which is
symmetric. With integer-scaled weights this is min-commutativity. -/

/-- Detailed-balance flux symmetry: min(wa, wb) = min(wb, wa). -/
theorem mh_flux_symm (wa wb : Int) : imin wa wb = imin wb wa :=
  imin_comm wa wb

/-! ### 8. Curveball trades stay on the fixed-margin fibre

Resolution boundary for the scope block above. The elementary move of the
curveball null sampler is a 2x2 checkerboard trade: rows i /= j and columns
a /= b, with the submatrix [[1,0],[0,1]] replaced by [[0,1],[1,0]] (or vice
versa; both directions are instances of the delta below). The claim that
the null ensemble is adequate splits into mechanics and statistics. The
mechanics -- the move set never leaves the fixed-margin fibre -- is
identity-type and proved here: a trade preserves every row sum and every
column sum. The statistics -- uniformity on the fibre, mixing, and every
other measurement-side item in the scope block -- are executed as seeded
PASS/FAIL checks by verify_claims.py beside this file, run by the same CI
workflow as this proof.

A matrix is Nat -> Nat -> Int; sums run over explicit index lists via
sumOver; countN counts occurrences. The preservation theorems hold for any
enumeration in which the two traded columns (resp. rows) occur equally
often -- in particular any duplicate-free enumeration containing both. -/

def countN (a : Nat) : List Nat → Int
  | [] => 0
  | x :: xs => (if x = a then 1 else 0) + countN a xs

def sumOver (f : Nat → Int) : List Nat → Int
  | [] => 0
  | x :: xs => f x + sumOver f xs

/-- The plus-minus-1 delta a trade applies at corners (i,a), (i,b), (j,a), (j,b). -/
def tradeDelta (i j a b r c : Nat) : Int :=
  (if r = i ∧ c = a then -1 else 0) + (if r = i ∧ c = b then 1 else 0)
    + (if r = j ∧ c = a then 1 else 0) + (if r = j ∧ c = b then -1 else 0)

/-- The traded matrix. -/
def trade (M : Nat → Nat → Int) (i j a b r c : Nat) : Int :=
  M r c + tradeDelta i j a b r c

theorem tradeDelta_row_other (i j a b r c : Nat) (h1 : r ≠ i) (h2 : r ≠ j) :
    tradeDelta i j a b r c = 0 := by
  have n1 : ¬(r = i ∧ c = a) := fun h => h1 h.1
  have n2 : ¬(r = i ∧ c = b) := fun h => h1 h.1
  have n3 : ¬(r = j ∧ c = a) := fun h => h2 h.1
  have n4 : ¬(r = j ∧ c = b) := fun h => h2 h.1
  simp [tradeDelta, n1, n2, n3, n4]

theorem tradeDelta_row_i (i j a b c : Nat) (hij : i ≠ j) :
    tradeDelta i j a b i c
      = (if c = a then (-1 : Int) else 0) + (if c = b then (1 : Int) else 0) := by
  have n3 : ¬(i = j ∧ c = a) := fun h => hij h.1
  have n4 : ¬(i = j ∧ c = b) := fun h => hij h.1
  simp [tradeDelta, n3, n4]

theorem tradeDelta_row_j (i j a b c : Nat) (hij : i ≠ j) :
    tradeDelta i j a b j c
      = (if c = a then (1 : Int) else 0) + (if c = b then (-1 : Int) else 0) := by
  have n1 : ¬(j = i ∧ c = a) := fun h => hij h.1.symm
  have n2 : ¬(j = i ∧ c = b) := fun h => hij h.1.symm
  simp [tradeDelta, n1, n2]

theorem trade_rowSum_other (M : Nat → Nat → Int) (i j a b r : Nat)
    (cols : List Nat) (h1 : r ≠ i) (h2 : r ≠ j) :
    sumOver (fun c => trade M i j a b r c) cols
      = sumOver (fun c => M r c) cols := by
  induction cols with
  | nil => rfl
  | cons x xs ih =>
      simp only [sumOver]
      rw [show trade M i j a b r x = M r x by
            unfold trade; rw [tradeDelta_row_other i j a b r x h1 h2]; omega]
      omega

theorem trade_rowSum_i (M : Nat → Nat → Int) (i j a b : Nat)
    (cols : List Nat) (hij : i ≠ j) :
    sumOver (fun c => trade M i j a b i c) cols
      = sumOver (fun c => M i c) cols + countN b cols - countN a cols := by
  induction cols with
  | nil => simp [sumOver, countN]
  | cons x xs ih =>
      simp only [sumOver, countN]
      rw [show trade M i j a b i x
            = M i x + ((if x = a then (-1 : Int) else 0)
                + (if x = b then (1 : Int) else 0)) by
            unfold trade; rw [tradeDelta_row_i i j a b x hij]]
      by_cases hxa : x = a <;> by_cases hxb : x = b <;> simp_all <;> omega

theorem trade_rowSum_j (M : Nat → Nat → Int) (i j a b : Nat)
    (cols : List Nat) (hij : i ≠ j) :
    sumOver (fun c => trade M i j a b j c) cols
      = sumOver (fun c => M j c) cols + countN a cols - countN b cols := by
  induction cols with
  | nil => simp [sumOver, countN]
  | cons x xs ih =>
      simp only [sumOver, countN]
      rw [show trade M i j a b j x
            = M j x + ((if x = a then (1 : Int) else 0)
                + (if x = b then (-1 : Int) else 0)) by
            unfold trade; rw [tradeDelta_row_j i j a b x hij]]
      by_cases hxa : x = a <;> by_cases hxb : x = b <;> simp_all <;> omega

theorem tradeDelta_col_other (i j a b r c : Nat) (h1 : c ≠ a) (h2 : c ≠ b) :
    tradeDelta i j a b r c = 0 := by
  have n1 : ¬(r = i ∧ c = a) := fun h => h1 h.2
  have n2 : ¬(r = i ∧ c = b) := fun h => h2 h.2
  have n3 : ¬(r = j ∧ c = a) := fun h => h1 h.2
  have n4 : ¬(r = j ∧ c = b) := fun h => h2 h.2
  simp [tradeDelta, n1, n2, n3, n4]

theorem tradeDelta_col_a (i j a b r : Nat) (hab : a ≠ b) :
    tradeDelta i j a b r a
      = (if r = i then (-1 : Int) else 0) + (if r = j then (1 : Int) else 0) := by
  have n2 : ¬(r = i ∧ a = b) := fun h => hab h.2
  have n4 : ¬(r = j ∧ a = b) := fun h => hab h.2
  simp [tradeDelta, n2, n4]

theorem tradeDelta_col_b (i j a b r : Nat) (hab : a ≠ b) :
    tradeDelta i j a b r b
      = (if r = i then (1 : Int) else 0) + (if r = j then (-1 : Int) else 0) := by
  have n1 : ¬(r = i ∧ b = a) := fun h => hab h.2.symm
  have n3 : ¬(r = j ∧ b = a) := fun h => hab h.2.symm
  simp [tradeDelta, n1, n3]

theorem trade_colSum_other (M : Nat → Nat → Int) (i j a b c : Nat)
    (rows : List Nat) (h1 : c ≠ a) (h2 : c ≠ b) :
    sumOver (fun r => trade M i j a b r c) rows
      = sumOver (fun r => M r c) rows := by
  induction rows with
  | nil => rfl
  | cons x xs ih =>
      simp only [sumOver]
      rw [show trade M i j a b x c = M x c by
            unfold trade; rw [tradeDelta_col_other i j a b x c h1 h2]; omega]
      omega

theorem trade_colSum_a (M : Nat → Nat → Int) (i j a b : Nat)
    (rows : List Nat) (hab : a ≠ b) :
    sumOver (fun r => trade M i j a b r a) rows
      = sumOver (fun r => M r a) rows + countN j rows - countN i rows := by
  induction rows with
  | nil => simp [sumOver, countN]
  | cons x xs ih =>
      simp only [sumOver, countN]
      rw [show trade M i j a b x a
            = M x a + ((if x = i then (-1 : Int) else 0)
                + (if x = j then (1 : Int) else 0)) by
            unfold trade; rw [tradeDelta_col_a i j a b x hab]]
      by_cases hxi : x = i <;> by_cases hxj : x = j <;> simp_all <;> omega

theorem trade_colSum_b (M : Nat → Nat → Int) (i j a b : Nat)
    (rows : List Nat) (hab : a ≠ b) :
    sumOver (fun r => trade M i j a b r b) rows
      = sumOver (fun r => M r b) rows + countN i rows - countN j rows := by
  induction rows with
  | nil => simp [sumOver, countN]
  | cons x xs ih =>
      simp only [sumOver, countN]
      rw [show trade M i j a b x b
            = M x b + ((if x = i then (1 : Int) else 0)
                + (if x = j then (-1 : Int) else 0)) by
            unfold trade; rw [tradeDelta_col_b i j a b x hab]]
      by_cases hxi : x = i <;> by_cases hxj : x = j <;> simp_all <;> omega

/-- A trade preserves every row sum, over any column enumeration counting
    the two traded columns equally often (any duplicate-free enumeration). -/
theorem trade_preserves_rowSum (M : Nat → Nat → Int) (i j a b r : Nat)
    (cols : List Nat) (hij : i ≠ j)
    (hbal : countN a cols = countN b cols) :
    sumOver (fun c => trade M i j a b r c) cols
      = sumOver (fun c => M r c) cols := by
  by_cases hri : r = i
  · have h := trade_rowSum_i M i j a b cols hij
    rw [hri]
    omega
  · by_cases hrj : r = j
    · have h := trade_rowSum_j M i j a b cols hij
      rw [hrj]
      omega
    · exact trade_rowSum_other M i j a b r cols hri hrj

/-- A trade preserves every column sum, over any row enumeration counting
    the two traded rows equally often (any duplicate-free enumeration). -/
theorem trade_preserves_colSum (M : Nat → Nat → Int) (i j a b c : Nat)
    (rows : List Nat) (hab : a ≠ b)
    (hbal : countN i rows = countN j rows) :
    sumOver (fun r => trade M i j a b r c) rows
      = sumOver (fun r => M r c) rows := by
  by_cases hca : c = a
  · have h := trade_colSum_a M i j a b rows hab
    rw [hca]
    omega
  · by_cases hcb : c = b
    · have h := trade_colSum_b M i j a b rows hab
      rw [hcb]
      omega
    · exact trade_colSum_other M i j a b c rows hca hcb

/-! ### 9. The F3 null is canonical: reversibility and uniform stationarity

README section F3 reads null standardization as deflection against an
unlensed background, with the fixed-margin ensemble as the medium. The
canonicity of that medium decomposes:
  (i)   the sampler's moves stay on the fixed-margin fibre (section 8);
  (ii)  every trade is reversible -- the column-swapped trade undoes it
        exactly -- so a uniform proposal has a symmetric kernel (here);
  (iii) a symmetric kernel makes the uniform distribution stationary:
        inflow to every state equals its constant outflow (here);
  (iv)  irreducibility of the trade graph on the fibre, and the
        constant-margin spectrum anchor (Lyu-Mukherjee / MP), are
        executed exhaustively by verify_claims.py claim 6.
With (i)-(iv) the unique stationary law of the curveball chain is uniform
on the fibre -- the maximum-entropy distribution given the margins, which
is what F3 requires of its vacuum. Uniqueness-from-irreducibility, previously
cited here as outside machine reach, is now proved in full generality in
section 10 (stationary_unique_uniform); the asymptotic Lyu-Mukherjee
spectrum theorem remains cited, not proved. -/

theorem sumOver_congr (f g : Nat → Int) (l : List Nat) (h : ∀ x, f x = g x) :
    sumOver f l = sumOver g l := by
  induction l with
  | nil => rfl
  | cons x xs ih => simp [sumOver, h x, ih]

/-- (ii) Every trade is undone exactly by the trade with columns swapped:
    the move set is reversible, so the uniform proposal kernel is
    symmetric. Pointwise identity, no hypotheses needed. -/
theorem trade_reversible (M : Nat → Nat → Int) (i j a b r c : Nat) :
    trade (trade M i j a b) i j b a r c = M r c := by
  unfold trade tradeDelta
  by_cases h1 : r = i <;> by_cases h2 : r = j <;>
    by_cases h3 : c = a <;> by_cases h4 : c = b <;>
      simp_all <;> omega

/-- (iii) Balance: for a symmetric kernel, total inflow to any state b
    equals total outflow from b, along any state enumeration. -/
theorem symm_kernel_balance (K : Nat → Nat → Int) (S : List Nat)
    (hsym : ∀ x y, K x y = K y x) (b : Nat) :
    sumOver (fun a => K a b) S = sumOver (fun a => K b a) S :=
  sumOver_congr _ _ S (fun a => hsym a b)

/-- (iii) Uniform stationarity: if a symmetric kernel has constant row
    sums R over the enumeration S, then the inflow to every state is
    that same R -- constant weights reproduce themselves, i.e. the
    uniform distribution is stationary for the chain. -/
theorem uniform_inflow_constant (K : Nat → Nat → Int) (S : List Nat) (R : Int)
    (hsym : ∀ x y, K x y = K y x)
    (hrow : ∀ a, sumOver (fun c => K a c) S = R) (b : Nat) :
    sumOver (fun a => K a b) S = R := by
  have h := symm_kernel_balance K S hsym b
  rw [h]
  exact hrow b


/-! ### 10. Full theorem: uniform is the unique stationary law (F3 capstone)

Closes the gap flagged at the end of section 9. What was previously
"outside machine reach and cited, not proved" -- uniqueness-from-
irreducibility for the finite chain -- is proved here, in core Lean,
over the same integer-scaled kernels as sections 7-9.

Setting: S enumerates the fibre; K is the integer-scaled transition
kernel. The curveball chain's uniform-proposal Metropolis kernel has
the three structural properties hypothesized below by construction:
nonnegativity, symmetry (section 9(ii), from trade_reversible), and
constant row sums (each state proposes the same total mass). A weight
vector pi is stationary when kernel-weighted inflow reproduces it:
sum_a pi(a)*K(a,b) = R*pi(b) for every b. Irreducibility -- every fibre
state reaches every other through positive-kernel steps (ReachFrom) --
is exactly what verify_claims.py claim 6 checks exhaustively on the
test instance.

The theorem: any stationary pi is constant across an irreducible fibre.
Hence the uniform distribution is the unique stationary law (up to the
overall scale a weight vector leaves free), which is what F3 requires
of its vacuum. The proof is the discrete maximum principle: at a
maximizer of pi, stationarity forces every positive-kernel neighbour
to attain the same maximum, and irreducibility propagates the maximum
everywhere. -/

theorem sumOver_nonneg (f : Nat → Int) (l : List Nat)
    (h : ∀ x ∈ l, 0 ≤ f x) : 0 ≤ sumOver f l := by
  induction l with
  | nil => exact Int.le_refl 0
  | cons x xs ih =>
      have hx : 0 ≤ f x := h x (by simp)
      have hxs : 0 ≤ sumOver f xs := ih (fun y hy => h y (List.mem_cons_of_mem x hy))
      show 0 ≤ f x + sumOver f xs
      omega

theorem sumOver_eq_zero_each (f : Nat → Int) (l : List Nat)
    (hnn : ∀ x ∈ l, 0 ≤ f x) (hz : sumOver f l = 0) :
    ∀ x ∈ l, f x = 0 := by
  induction l with
  | nil => intro x hx; cases hx
  | cons y ys ih =>
      have hy : 0 ≤ f y := hnn y (by simp)
      have hys_nn : ∀ x ∈ ys, 0 ≤ f x := fun x hx => hnn x (List.mem_cons_of_mem y hx)
      have hys : 0 ≤ sumOver f ys := sumOver_nonneg f ys hys_nn
      have hz' : f y + sumOver f ys = 0 := hz
      intro x hx
      rcases List.mem_cons.mp hx with h | h
      · rw [h]; omega
      · exact ih hys_nn (by omega) x h

theorem sumOver_sub (f g : Nat → Int) (l : List Nat) :
    sumOver (fun x => f x - g x) l = sumOver f l - sumOver g l := by
  induction l with
  | nil => rfl
  | cons x xs ih =>
      simp only [sumOver]
      omega

theorem sumOver_mul_left (c : Int) (f : Nat → Int) (l : List Nat) :
    sumOver (fun x => c * f x) l = c * sumOver f l := by
  induction l with
  | nil => simp [sumOver]
  | cons x xs ih =>
      simp only [sumOver]
      rw [ih, Int.mul_add]

/-- Discrete maximum principle at a maximizer: stationarity forces every
    positive-kernel in-neighbour of the maximizer to attain the maximum.
    The algebra: inflow at b equals R*pi(b), which also equals the sum of
    pi(b)*K(a,b) (column sums equal row sums by symmetry); the difference
    is a sum of nonnegative terms equal to zero, so each term vanishes. -/
theorem stationary_max_principle
    (K : Nat → Nat → Int) (π : Nat → Int) (S : List Nat) (R : Int)
    (hnn : ∀ x y, 0 ≤ K x y)
    (hsym : ∀ x y, K x y = K y x)
    (hrow : ∀ a, sumOver (fun c => K a c) S = R)
    (hstat : ∀ b, sumOver (fun a => π a * K a b) S = R * π b)
    (b : Nat) (hmax : ∀ a ∈ S, π a ≤ π b) :
    ∀ a ∈ S, 0 < K a b → π a = π b := by
  have hcol : sumOver (fun a => K a b) S = R := by
    rw [symm_kernel_balance K S hsym b]
    exact hrow b
  have hconst : sumOver (fun a => π b * K a b) S = R * π b := by
    rw [sumOver_mul_left (π b) (fun a => K a b) S, hcol, Int.mul_comm]
  have hsplit : sumOver (fun a => (π b - π a) * K a b) S
      = sumOver (fun a => π b * K a b - π a * K a b) S :=
    sumOver_congr _ _ S (fun a => Int.sub_mul (π b) (π a) (K a b))
  have hdiff : sumOver (fun a => (π b - π a) * K a b) S = 0 := by
    rw [hsplit, sumOver_sub (fun a => π b * K a b) (fun a => π a * K a b) S,
        hconst, hstat b]
    omega
  have hterm_nn : ∀ a ∈ S, 0 ≤ (π b - π a) * K a b := by
    intro a ha
    have h1 : π a ≤ π b := hmax a ha
    exact Int.mul_nonneg (by omega) (hnn a b)
  have hzero := sumOver_eq_zero_each (fun a => (π b - π a) * K a b) S hterm_nn hdiff
  intro a ha hK
  have hz : (π b - π a) * K a b = 0 := hzero a ha
  have h1 : π a ≤ π b := hmax a ha
  by_cases h : π a = π b
  · exact h
  · exfalso
    have hpos : 0 < (π b - π a) * K a b := Int.mul_pos (by omega) hK
    omega

/-- Reachability through positive-kernel steps whose targets lie in the
    enumeration S: the irreducibility relation of the trade graph. -/
inductive ReachFrom (K : Nat → Nat → Int) (S : List Nat) (b : Nat) : Nat → Prop
  | refl : ReachFrom K S b b
  | tail {y z : Nat} : ReachFrom K S b y → z ∈ S → 0 < K z y → ReachFrom K S b z

/-- The maximum propagates along reachability: every state reachable from
    a maximizer carries the maximal weight. -/
theorem max_propagates
    (K : Nat → Nat → Int) (π : Nat → Int) (S : List Nat) (R : Int)
    (hnn : ∀ x y, 0 ≤ K x y)
    (hsym : ∀ x y, K x y = K y x)
    (hrow : ∀ a, sumOver (fun c => K a c) S = R)
    (hstat : ∀ b, sumOver (fun a => π a * K a b) S = R * π b)
    (b : Nat) (hmax : ∀ a ∈ S, π a ≤ π b) :
    ∀ a, ReachFrom K S b a → π a = π b := by
  intro a hr
  induction hr with
  | refl => rfl
  | @tail y z hry hzS hKzy ih =>
      have hmax' : ∀ w ∈ S, π w ≤ π y := by
        intro w hw
        rw [ih]
        exact hmax w hw
      have hzy : π z = π y :=
        stationary_max_principle K π S R hnn hsym hrow hstat y hmax' z hzS hKzy
      rw [hzy, ih]

/-- A finite nonempty enumeration has a maximizer. -/
theorem exists_max (π : Nat → Int) :
    ∀ (S : List Nat), S ≠ [] → ∃ b, b ∈ S ∧ ∀ a ∈ S, π a ≤ π b := by
  intro S
  induction S with
  | nil => intro h; exact absurd rfl h
  | cons x xs ih =>
      intro _
      by_cases hxs : xs = []
      · subst hxs
        refine ⟨x, by simp, ?_⟩
        intro a ha
        have hax : a = x := by simpa using ha
        rw [hax]
        exact Int.le_refl _
      · obtain ⟨b, hbmem, hbmax⟩ := ih hxs
        by_cases hcmp : π b ≤ π x
        · refine ⟨x, by simp, ?_⟩
          intro a ha
          rcases List.mem_cons.mp ha with h | h
          · rw [h]; exact Int.le_refl _
          · exact Int.le_trans (hbmax a h) hcmp
        · refine ⟨b, List.mem_cons_of_mem x hbmem, ?_⟩
          intro a ha
          rcases List.mem_cons.mp ha with h | h
          · rw [h]; omega
          · exact hbmax a h

/-- Full theorem (F3 capstone): on an irreducible fibre, every stationary
    weight vector of a nonnegative symmetric constant-row-sum kernel is
    constant -- the uniform distribution is the unique stationary law of
    the curveball chain, the maximum-entropy vacuum F3 requires.
    Previously cited, not proved; now closed. -/
theorem stationary_unique_uniform
    (K : Nat → Nat → Int) (π : Nat → Int) (S : List Nat) (R : Int)
    (hnn : ∀ x y, 0 ≤ K x y)
    (hsym : ∀ x y, K x y = K y x)
    (hrow : ∀ a, sumOver (fun c => K a c) S = R)
    (hstat : ∀ b, sumOver (fun a => π a * K a b) S = R * π b)
    (hirr : ∀ x ∈ S, ∀ y ∈ S, ReachFrom K S x y) :
    ∀ x ∈ S, ∀ y ∈ S, π x = π y := by
  intro x hx y hy
  have hne : S ≠ [] := by
    intro h
    rw [h] at hx
    cases hx
  obtain ⟨b, hbS, hbmax⟩ := exists_max π S hne
  have hxb : π x = π b :=
    max_propagates K π S R hnn hsym hrow hstat b hbmax x (hirr b hbS x hx)
  have hyb : π y = π b :=
    max_propagates K π S R hnn hsym hrow hstat b hbmax y (hirr b hbS y hy)
  rw [hxb, hyb]


/-! ### 11. The MP/Narayana moment skeleton of the Lyu-Mukherjee anchor

The one remaining cited-not-proved item is the asymptotic Lyu-Mukherjee
spectrum theorem: the bulk spectrum of the constant-margin ensemble
converges (n -> infinity) to a Marchenko-Pastur law. The limit statement
is measure-theoretic and stays outside this file's machine reach. What
IS identity-type is the algebraic skeleton of its target: the k-th MP
moment is the Narayana polynomial m_k(lam) = sum_r N(k,r) lam^r -- the
sum over non-crossing partitions of [k] weighted by block count -- and
its lam = 1 specialization is the k-th Catalan number. This section
machine-checks that skeleton over exact integer polynomial arithmetic:
polynomials are little-endian Int coefficient lists; mp k is defined by
the free-Poisson functional equation M = 1 + z*M*(M + lam - 1) (the
first-return decomposition of non-crossing partitions); catalan is
defined by the Segner recurrence. The theorems pin the Narayana rows
and the row-sum = Catalan identity through k = 8 as kernel-checked
computations. verify_claims.py claim 7 consumes exactly these rows: it
recomputes them in float, then measures the empirical spectral moments
of the curveball-sampled constant-margin ensemble against them. The
weak-convergence limit itself remains cited, per the scope block. -/

def pAdd : List Int → List Int → List Int
  | [], q => q
  | p, [] => p
  | a :: p, b :: q => (a + b) :: pAdd p q

def pMul : List Int → List Int → List Int
  | [], _ => []
  | a :: p, q => pAdd (q.map (fun b => a * b)) (0 :: pMul p q)

def evalOne : List Int → Int
  | [] => 0
  | a :: p => a + evalOne p

/-- Segner recurrence step: C_n = sum over i < n of C_i * C_(n-1-i). -/
def segnerNext (t : List Nat) : Nat :=
  (List.range t.length).foldl
    (fun acc i => acc + t.getD i 0 * t.getD (t.length - 1 - i) 0) 0

def catTable : Nat → List Nat
  | 0 => [1]
  | n + 1 => let t := catTable n; t ++ [segnerNext t]

def catalan (k : Nat) : Nat := (catTable k).getD k 0

/-- q_0 = lam (the polynomial [0,1]); q_j = m_j for j >= 1. -/
def qOf (ms : List (List Int)) (j : Nat) : List Int :=
  if j = 0 then [0, 1] else ms.getD j []

/-- m_k = sum over i of m_i * q_(k-1-i): coefficient extraction of the
    functional equation M = 1 + z*M*(M + lam - 1). -/
def mpNext (ms : List (List Int)) : List Int :=
  (List.range ms.length).foldl
    (fun acc i => pAdd acc (pMul (ms.getD i []) (qOf ms (ms.length - 1 - i)))) []

def mpTable : Nat → List (List Int)
  | 0 => [[1]]
  | n + 1 => let t := mpTable n; t ++ [mpNext t]

/-- The k-th moment polynomial of the free-Poisson / Marchenko-Pastur
    target, as a little-endian coefficient list in lam. -/
def mp (k : Nat) : List Int := (mpTable k).getD k []

/-- Catalan numbers C_0..C_8 by the Segner recurrence. -/
theorem catalan_first_nine :
    (List.range 9).map catalan = [1, 1, 2, 5, 14, 42, 132, 429, 1430] := by
  decide

/-- Narayana rows: mp k lists N(k,r) as the coefficient of lam^r. -/
theorem mp_row_one : mp 1 = [0, 1] := by decide
theorem mp_row_two : mp 2 = [0, 1, 1] := by decide
theorem mp_row_three : mp 3 = [0, 1, 3, 1] := by decide
theorem mp_row_four : mp 4 = [0, 1, 6, 6, 1] := by decide
theorem mp_row_five : mp 5 = [0, 1, 10, 20, 10, 1] := by decide
theorem mp_row_six : mp 6 = [0, 1, 15, 50, 50, 15, 1] := by decide

/-- Row sums specialize to Catalan: m_k(1) = C_k, through k = 8. -/
theorem mp_rowsum_eq_catalan :
    (List.range 9).map (fun k => evalOne (mp k))
      = (List.range 9).map (fun k => (catalan k : Int)) := by
  decide


/-! ### 12. The decibel laws: exact level arithmetic (corpus sonometry)

The corpus level of an effect against the curveball vacuum is reported
in dBc: L = 20*log10(|effect| / sigma_null), referenced so 0 dBc is the
null's own RMS fluctuation -- the smallest detectable effect, the
acoustician's 20 microPascal (verify_claims.py claim 8; the instrument
is tools/corpus-sonometer). The real-valued log10 is measurement-side;
what is identity-type is the law structure that makes a level scale
meaningful, and on integer powers of a fixed base it is exact:
  - cascaded gains multiply while their levels add (bpow_add -- the
    reason decibels add, and the discrete form of section 6's
    heat_exponent_additive);
  - squaring a ratio doubles its level (level_double -- why pressure
    quantities take 20*log10 where power quantities take 10*log10);
  - levels are strictly ordered and injective (bpow_mono,
    level_injective -- a dB reading is well defined). -/

def bpow (b : Nat) : Nat → Nat
  | 0 => 1
  | k + 1 => b * bpow b k

theorem bpow_pos (b : Nat) (hb : 0 < b) (k : Nat) : 0 < bpow b k := by
  induction k with
  | zero => exact Nat.le_refl 1
  | succ m ih =>
      show 0 < b * bpow b m
      exact Nat.mul_pos hb ih

/-- Cascade law: gains multiply, levels add. bpow b (s + t) is the gain
    of s + t cascaded stages; its level (exponent) is the sum. -/
theorem bpow_add (b s t : Nat) :
    bpow b (s + t) = bpow b s * bpow b t := by
  induction s with
  | zero => simp [bpow]
  | succ m ih =>
      have e1 : m + 1 + t = (m + t) + 1 := by omega
      rw [e1]
      show b * bpow b (m + t) = b * bpow b m * bpow b t
      rw [ih, Nat.mul_assoc]

/-- The pressure/power factor of two: squaring a ratio doubles its
    level. This is why sound pressure takes 20*log10 while power takes
    10*log10 -- the factor 2 is exact, not empirical. -/
theorem level_double (b k : Nat) :
    bpow b (2 * k) = bpow b k * bpow b k := by
  have e : 2 * k = k + k := by omega
  rw [e, bpow_add]

theorem bpow_lt_succ (b k : Nat) (hb : 2 ≤ b) :
    bpow b k < bpow b (k + 1) := by
  have hp : 0 < bpow b k := bpow_pos b (by omega) k
  have h2 : 2 * bpow b k ≤ b * bpow b k :=
    Nat.mul_le_mul hb (Nat.le_refl (bpow b k))
  have e : bpow b (k + 1) = b * bpow b k := rfl
  omega

/-- Levels are strictly ordered: a higher level is strictly louder. -/
theorem bpow_mono (b : Nat) (hb : 2 ≤ b) :
    ∀ k l, k < l → bpow b k < bpow b l := by
  intro k l
  induction l with
  | zero => intro h; exact absurd h (Nat.not_lt_zero k)
  | succ m ih =>
      intro h
      by_cases hkm : k = m
      · rw [hkm]
        exact bpow_lt_succ b m hb
      · have hkm' : k < m := by omega
        exact Nat.lt_trans (ih hkm') (bpow_lt_succ b m hb)

/-- A dB reading is well defined: equal gains have equal levels. -/
theorem level_injective (b k l : Nat) (hb : 2 ≤ b)
    (h : bpow b k = bpow b l) : k = l := by
  by_cases hkl : k = l
  · exact hkl
  · exfalso
    rcases Nat.lt_or_ge k l with hlt | hge
    · have := bpow_mono b hb k l hlt
      omega
    · have hgt : l < k := by omega
      have := bpow_mono b hb l k hgt
      omega

/-! ### 13. Zernike radial polynomials: exact integer identities

Slot 4 of the Zernike audit (refs/zernike-fit-2026-08-24.md). Zernike
polynomials Z_n^m are the orthogonal basis on the unit disk used to
expand an optical system's deviation from ideal (Zernike 1934, Physica
1:689; Noll, JOSA 66:207, 1976). Their radial parts R_n^m carry an
exact integer-coefficient closed form,

  R_n^m(rho) = sum_k (-1)^k C(n-k, k) C(n-2k, (n-m)/2 - k) rho^(n-2k),

summed over k = 0 .. (n-m)/2. That is identity-type and therefore
kernel-checkable, exactly like section 11's Narayana rows. This section
defines the generator zernikeR over the same little-endian Int
coefficient lists used there (pAdd / pMul / evalOne are reused, not
redefined) and proves by decide that it reproduces the hand-written
low-order polynomials implemented downstream; that each is normalized
(R_n^m(1) = 1, read off by evalOne, which sums coefficients and so
evaluates at rho = 1); that the parity structure holds (a coefficient
may be nonzero only at an index of the same parity as n); and that the
degrees are as advertised.

What is identity-type here: the integer coefficient structure, the
normalization, the parity, the degrees -- all exact, all closed terms.
What stays measurement-side: orthogonality on the real disk (a real
integral, not an integer identity), any Zernike spectrum of the corpus
point distribution, and any aberrated-lens Delta-J -- those live in
tools/zernike-spectrum, face seeded nulls and the membership condition
in CI, and are never elevated to theorems here. Note also the naming
collision flagged in the unified paper's optical-language caveat: the
Z_2^0 mode is called defocus in optics but is a deterministic quadratic
rephasing, not the program's stochastic heat flow in t. -/

/-- Binomial coefficients by the Pascal recurrence (no library use). -/
def binom : Nat -> Nat -> Nat
  | _, 0 => 1
  | 0, _ + 1 => 0
  | n + 1, k + 1 => binom n k + binom n (k + 1)

/-- The k-th term's integer coefficient in the closed form for R_n^m. -/
def zernikeCoeff (n m k : Nat) : Int :=
  let c : Int := Int.ofNat (binom (n - k) k * binom (n - 2 * k) ((n - m) / 2 - k))
  if k % 2 = 0 then c else -c

/-- R_n^m as a little-endian Int coefficient list in rho, generated from
    the binomial closed form: index j carries the coefficient of rho^j. -/
def zernikeR (n m : Nat) : List Int :=
  (List.range (n + 1)).map (fun j =>
    if (n - j) % 2 = 0 then
      (if (n - j) / 2 <= (n - m) / 2 then zernikeCoeff n m ((n - j) / 2) else 0)
    else 0)

/-- The low orders implemented downstream, written out by hand. -/
def zernikeR11 : List Int := [0, 1]
def zernikeR20 : List Int := [-1, 0, 2]
def zernikeR22 : List Int := [0, 0, 1]
def zernikeR31 : List Int := [0, -2, 0, 3]
def zernikeR33 : List Int := [0, 0, 0, 1]
def zernikeR40 : List Int := [1, 0, -6, 0, 6]
def zernikeR42 : List Int := [0, 0, -3, 0, 4]
def zernikeR44 : List Int := [0, 0, 0, 0, 1]

/-- The closed form reproduces every hand-written low order exactly. -/
theorem zernikeR_gen_11 : zernikeR 1 1 = zernikeR11 := by decide
theorem zernikeR_gen_20 : zernikeR 2 0 = zernikeR20 := by decide
theorem zernikeR_gen_22 : zernikeR 2 2 = zernikeR22 := by decide
theorem zernikeR_gen_31 : zernikeR 3 1 = zernikeR31 := by decide
theorem zernikeR_gen_33 : zernikeR 3 3 = zernikeR33 := by decide
theorem zernikeR_gen_40 : zernikeR 4 0 = zernikeR40 := by decide
theorem zernikeR_gen_42 : zernikeR 4 2 = zernikeR42 := by decide
theorem zernikeR_gen_44 : zernikeR 4 4 = zernikeR44 := by decide

/-- Normalization: R_n^m(1) = 1 for every listed order. evalOne sums the
    coefficients, which is evaluation at rho = 1. -/
theorem zernikeR_normalized :
    [evalOne (zernikeR 1 1), evalOne (zernikeR 2 0), evalOne (zernikeR 2 2),
     evalOne (zernikeR 3 1), evalOne (zernikeR 3 3), evalOne (zernikeR 4 0),
     evalOne (zernikeR 4 2), evalOne (zernikeR 4 4)]
      = [1, 1, 1, 1, 1, 1, 1, 1] := by decide

/-- Parity check: every coefficient at an index of the wrong parity
    (index parity /= n parity) must vanish. -/
def parityClean (n : Nat) (p : List Int) : Bool :=
  (List.range p.length).all (fun j =>
    if j % 2 = n % 2 then true else p.getD j 0 == 0)

theorem zernikeR_parity :
    [parityClean 1 (zernikeR 1 1), parityClean 2 (zernikeR 2 0),
     parityClean 2 (zernikeR 2 2), parityClean 3 (zernikeR 3 1),
     parityClean 3 (zernikeR 3 3), parityClean 4 (zernikeR 4 0),
     parityClean 4 (zernikeR 4 2), parityClean 4 (zernikeR 4 4)]
      = [true, true, true, true, true, true, true, true] := by decide

/-- Degrees: R_n^m has degree n, so the coefficient list has length n+1. -/
theorem zernikeR_degrees :
    [(zernikeR 1 1).length, (zernikeR 2 0).length, (zernikeR 2 2).length,
     (zernikeR 3 1).length, (zernikeR 3 3).length, (zernikeR 4 0).length,
     (zernikeR 4 2).length, (zernikeR 4 4).length]
      = [2, 3, 3, 4, 4, 5, 5, 5] := by decide

/-- The defocus mode in section 11's polynomial arithmetic: R_2^0 is
    2*rho^2 - 1 built from pMul and pAdd, the same helpers the Narayana
    skeleton uses. -/
theorem zernikeR20_as_pAdd_pMul :
    zernikeR 2 0 = pAdd [-1] (pMul [0, 1] [0, 2]) := by decide

/-! ### 14. Phonon identities: sum rule, diatomic gap, Gaunt selection rules

The acoustic/optical phonon reading of the program
(refs/acoustic-optical-phonons-bridge-2026-09-01.md; instrument
tools/phonon-dispersion). Verdicts live in the refs doc; what lands here
is only the identity-type algebra behind them, in the file's exclusion
discipline:

  - acoustic_sum_rule -- the acoustic sum rule IS the Markov mass-
    conservation constraint: a graph-Laplacian row applied to a constant
    field vanishes term by term, which is why the l = 0 mode has
    eigenvalue 0 and the forward defocus terminates at uniform. This is
    the one phonon/program identity with no free parameter (the mapping
    report's item 1a). The Goldstone reading of the same fact is
    EXCLUDED (no spontaneous symmetry breaking, no gapless continuum on
    a compact S^2); only the constraint-structure identity is admitted.
  - diatomic_disc / gap_closes_iff / gap_open_of_ne -- the zone-boundary
    algebra of the 1-D diatomic chain: the dispersion discriminant at
    the zone edge collapses to a perfect square, (a+b)^2 - 4ab = (a-b)^2
    (a, b standing for the inverse masses 1/m1, 1/m2 in any common
    units), so the two branches split by exactly |a - b| there; the band
    gap is open iff the masses differ and closes iff they are equal.
    Two populations per cell is what an optical branch costs -- the
    program's single scalar field on S^2 has no optical branch, and the
    delayed/prompt low-l/high-l split is a cut on ONE branch, not a
    second branch.
  - klemens_condition -- the energy side of the Klemens channel
    (optical -> 2 acoustic, Phys. Rev. 148, 845) on the diatomic chain:
    with u, v the inverse masses (u = 1/m_light >= v = 1/m_heavy), the
    zone-center optical quantum fits two zone-boundary acoustic quanta
    iff 2C(u+v) <= 4(2Cv), i.e. iff u <= 3v -- the mass ratio must not
    exceed 3. The C cancels; the threshold is exact integer arithmetic.
  - gaunt counts -- the momentum-conservation side of Klemens on S^2:
    cubic anharmonicity couples degrees only through Gaunt coefficients,
    which vanish unless the triangle rule |l1-l2| <= l3 <= l1+l2 and
    even parity l1+l2+l3 hold (the rotational analogue of
    q1 + q2 + q3 = 0). This is the structure that replaces the generic
    off-diagonal k_ISC matrix (O(L^2) free entries) with ONE amplitude:
    the sparsity pattern is derived, not fitted. The counts at the
    program's truncation L = 3 are kernel-checked below: of 64 triads,
    34 pass the triangle rule and 23 survive parity -- 41/64 forbidden,
    so the selection-rule structure is NOT vacuous at L = 3 (parity does
    the heavier culling: 30 of 64 by triangle, a further 11 by parity).
  - heat_exp_dominates_hamming -- the level-penalty comparison between
    the two harmonic homes of a {0,1}^d corpus: on the Hamming graph
    H(d,2) the Laplacian eigenvalue is linear in the level (2j at
    Hamming weight j); on S^2 it is quadratic (2l(l+1) at degree l).
    Beyond the shared zero mode the sphere penalizes level strictly
    faster: l < l(l+1) for every l >= 1, with equality only at l = 0.

What stays measurement-side, never elevated here: any fitted branch
structure on the real corpus, the Fermi-Dirac/Binomial identity for the
compass stationary law at linear Phi (real-valued; checked numerically
by tools/phonon-dispersion --selftest), any Gaunt-coupled defocus fit
and its curveball admission null, and every statement about pi_T or T_x
(designed-chain wall). -/

/-- sumOver of the zero function vanishes. -/
theorem sumOver_zero_fn (S : List Nat) : sumOver (fun _ => (0 : Int)) S = 0 := by
  induction S with
  | nil => rfl
  | cons x xs ih =>
      show (0 : Int) + sumOver (fun _ => (0 : Int)) xs = 0
      rw [ih, Int.add_zero]

/-- Acoustic sum rule = Markov mass conservation: a weighted Laplacian
    row w_j * (u_i - u_j) applied to a constant field u = c vanishes,
    for any weights and any neighbor enumeration. The l = 0 zero mode
    of the defocus operator is this constraint, not a Goldstone mode. -/
theorem acoustic_sum_rule (w : Nat → Int) (c : Int) (S : List Nat) :
    sumOver (fun j => w j * (c - c)) S = 0 := by
  have h : ∀ x, w x * (c - c) = (fun _ => (0 : Int)) x := by
    intro x
    show w x * (c - c) = 0
    rw [Int.sub_self, Int.mul_zero]
  rw [sumOver_congr (fun j => w j * (c - c)) (fun _ => (0 : Int)) S h,
      sumOver_zero_fn]

/-- Zone-boundary discriminant of the 1-D diatomic chain: with a, b the
    inverse masses, (a+b)^2 - 4ab collapses to the perfect square
    (a-b)^2 -- the algebra that opens the band gap. -/
theorem diatomic_disc (a b : Int) :
    (a + b) * (a + b) - 4 * (a * b) = (a - b) * (a - b) := by
  have h1 : (a + b) * (a + b) = a * a + a * b + (a * b + b * b) := by
    rw [Int.add_mul, Int.mul_add, Int.mul_add, Int.mul_comm b a]
  have h2 : (a - b) * (a - b) = a * a - a * b - (a * b - b * b) := by
    rw [Int.sub_mul, Int.mul_sub, Int.mul_sub, Int.mul_comm b a]
  rw [h1, h2]
  generalize a * a = x
  generalize a * b = y
  generalize b * b = z
  omega

/-- Mass contrast opens a strictly positive squared gap. -/
theorem gap_open_of_ne (a b : Int) (h : a ≠ b) : 0 < (a - b) * (a - b) := by
  have hd : a - b ≠ 0 := by omega
  rcases Int.lt_trichotomy (a - b) 0 with hneg | hzero | hpos
  · have hpos' : 0 < -(a - b) := by omega
    have hmul := Int.mul_pos hpos' hpos'
    rwa [Int.neg_mul_neg] at hmul
  · exact absurd hzero hd
  · exact Int.mul_pos hpos hpos

/-- The band gap closes iff the two masses are equal. -/
theorem gap_closes_iff (a b : Int) : (a - b) * (a - b) = 0 ↔ a = b := by
  constructor
  · intro h
    rcases Int.lt_trichotomy a b with hlt | heq | hgt
    · have hne : a ≠ b := by omega
      have hpos := gap_open_of_ne a b hne
      omega
    · exact heq
    · have hne : a ≠ b := by omega
      have hpos := gap_open_of_ne a b hne
      omega
  · intro h
    rw [h, Int.sub_self, Int.mul_zero]

/-- Klemens energy condition on the diatomic chain: with u >= v > 0 the
    inverse masses, the zone-center optical quantum 2C(u+v) fits two
    zone-boundary acoustic quanta 2 * sqrt(2Cv) -- squared: <= 4(2Cv) --
    iff the mass ratio u/v is at most 3. C cancels exactly. -/
theorem klemens_condition (u v : Nat) : u + v ≤ 4 * v ↔ u ≤ 3 * v := by
  omega

/-- Zonal Gaunt admissibility: triangle rule + even parity. The Gaunt
    coefficient of (l1, l2, l3) vanishes unless this holds -- the S^2
    analogue of phonon momentum conservation q1 + q2 + q3 = 0. -/
def gauntTriangle (l1 l2 l3 : Nat) : Bool :=
  decide (l3 ≤ l1 + l2) && decide (l1 ≤ l2 + l3) && decide (l2 ≤ l1 + l3)

def gauntAllowed (l1 l2 l3 : Nat) : Bool :=
  gauntTriangle l1 l2 l3 && ((l1 + l2 + l3) % 2 == 0)

/-- Count triads (l1, l2, l3) with all l_i <= L passing a predicate. -/
def triadCount (p : Nat → Nat → Nat → Bool) (L : Nat) : Nat :=
  ((List.range (L + 1)).map (fun l1 =>
    ((List.range (L + 1)).map (fun l2 =>
      ((List.range (L + 1)).filter (fun l3 => p l1 l2 l3)).length)).foldl
        (· + ·) 0)).foldl (· + ·) 0

/-- At the program's truncation L = 3: 64 triads, 34 pass the triangle
    rule, 23 survive parity as well -- 41/64 forbidden. The selection
    structure is not vacuous at L = 3, and parity does the heavier
    culling. Kernel-checked enumeration; cross-checked against the exact
    Wigner 3j(0,0,0) zero pattern and the Simpson triple-Legendre
    integral in tools/phonon-dispersion --selftest. -/
theorem gaunt_triangle_count_L3 : triadCount gauntTriangle 3 = 34 := by decide

theorem gaunt_allowed_count_L3 : triadCount gauntAllowed 3 = 23 := by decide

theorem gaunt_forbidden_L3 :
    4 * 4 * 4 - triadCount gauntAllowed 3 = 41 := by decide

/-- Level penalty: beyond the shared zero mode, the S^2 eigenvalue
    l(l+1) dominates the Hamming level l strictly, for every l >= 1.
    (Multiplying both by 2 gives the energy-decay rates 2l(l+1) vs 2l.) -/
theorem heat_exp_dominates_hamming (l : Nat) (h : 1 ≤ l) : l < heatExp l := by
  show l < l * (l + 1)
  have hp : 0 < l * l := Nat.mul_pos h h
  calc l = 0 + l := (Nat.zero_add l).symm
    _ < l * l + l := Nat.add_lt_add_right hp l
    _ = l * (l + 1) := by rw [Nat.mul_add, Nat.mul_one]

/-- At l = 0 the two spectra agree exactly: the shared zero mode. -/
theorem heat_exp_zero_mode : heatExp 0 = 0 := by decide

/-! ### 15. Harness algebra: the envharness contracts, kernel-checked

google-research/envharness (arXiv:2608.19880) builds agent evaluation on a
wrapper algebra: EnvHarness IS-A ActionableEnv wrapping an inner
ActionableEnv, so harnesses stack arbitrarily; the Rules harness applies
A/T/O hooks per step, where a Blocked action must leave the environment
unchanged and emit zero reward; BudgetPolicy decides when the mutation
search loop halts; DifficultyZone scores a success-rate window against a
target band. Audit: refs/envharness-lean-replacement-audit-2026-09-01.md.

Every one of those load-bearing contracts is stated in prose or implied
by construction in the Python source, and none is machine-checked there.
This section checks the identity-type layer, in the same discipline as
sections 1-14: the algebra is proved, the execution stays outside.

  - hcomp_* -- the stacking algebra (core/envharness.py): the identity
    harness is a two-sided neutral element and composition is
    associative, on both the action path (outer filters first; Blocked
    short-circuits) and the observation path (inner transforms first).
    These are the laws that make "harnesses stack arbitrarily" true.
  - blocked_is_noop -- the Blocked contract (harnesses/rules.py step):
    a rejected action is a state no-op with zero reward. In rules.py
    this holds by construction of one code path; here it is a theorem
    over every environment transition function.
  - *_halts -- termination of all three BudgetPolicy implementations
    (orchestration/budget.py): each stops at its cap, and ACCEPT stops
    the capped policies immediately. The search loop provably cannot
    run away.
  - dz_band_iff -- the DifficultyZone band test in exact integer
    arithmetic (orchestration/objectives.py): sr in [lo, hi] iff the
    doubled center-distance is within the band width. The float
    formula max(0, 1 - |sr-c|/h) is measurement-side; the band
    membership it encodes is exact.
  - weights_round_gap -- a genuine gap the formalization surfaces:
    _weights_from_failure_axes emits round(v/s, 3) weights, and fixed-
    precision weights need not sum to unity. Concrete kernel-checked
    instance: axis counts (0,0,0,0,1) give exact inverse weights
    (2,2,2,2,1)/9, whose per-mille floors sum to 999, not 1000. The
    exact numerators sum to the common denominator; every fixed-
    precision emission needs a remainder-distribution rule.

What is NOT claimed: no theorem here executes an environment, compiles
LLM-emitted hook code (core/code_loader.py -- an exec of model-written
Python, a trust surface this program would gate, not prove), or elevates
any benchmark score. The statistics layer is covered elsewhere: an
envharness ObjectiveSignal built on raw window means has no matched
null; sections 8-12 (fibre preservation, reversibility, uniqueness,
MP moments, level laws) are the drop-in replacement for that layer,
executed by verify_claims.py and the curveball instruments. -/

/-- A harness at the algebra level: an action filter (none = Blocked)
    and an observation transform. rules.py's modify_transition folds
    into fO for this model's purposes (both are post-step transforms). -/
structure HarnessM where
  fA : Int → Option Int
  fO : Int → Int

/-- The all-defaults EnvHarness: pass-through on both paths. -/
def idHarness : HarnessM := ⟨fun a => some a, fun o => o⟩

/-- Stack `outer` over `inner`: the agent's action meets the outer
    filter first (a Block short-circuits the whole stack); the raw
    observation meets the inner transform first. -/
def hcomp (outer inner : HarnessM) : HarnessM :=
  ⟨fun a => match outer.fA a with
    | none => none
    | some a' => inner.fA a',
   fun o => outer.fO (inner.fO o)⟩

theorem hcomp_id_left_A (h : HarnessM) (a : Int) :
    (hcomp idHarness h).fA a = h.fA a := rfl

theorem hcomp_id_right_A (h : HarnessM) (a : Int) :
    (hcomp h idHarness).fA a = h.fA a := by
  cases hfa : h.fA a <;> simp [hcomp, idHarness, hfa]

theorem hcomp_id_left_O (h : HarnessM) (o : Int) :
    (hcomp idHarness h).fO o = h.fO o := rfl

theorem hcomp_id_right_O (h : HarnessM) (o : Int) :
    (hcomp h idHarness).fO o = h.fO o := rfl

/-- Stacking is associative on the action path. -/
theorem hcomp_assoc_A (f g h : HarnessM) (a : Int) :
    (hcomp (hcomp f g) h).fA a = (hcomp f (hcomp g h)).fA a := by
  cases hf : f.fA a with
  | none => simp [hcomp, hf]
  | some a' => cases hg : g.fA a' <;> simp [hcomp, hf, hg]

/-- Stacking is associative on the observation path. -/
theorem hcomp_assoc_O (f g h : HarnessM) (o : Int) :
    (hcomp (hcomp f g) h).fO o = (hcomp f (hcomp g h)).fO o := rfl

/-- One Rules.step at the algebra level: envStep is the inner
    environment's transition (state, action) -> (state', reward). -/
def stepH (h : HarnessM) (envStep : Int → Int → Int × Int)
    (s a : Int) : Int × Int :=
  match h.fA a with
  | none => (s, 0)
  | some a' => envStep s a'

/-- The Blocked contract: a rejected action leaves the state unchanged
    and emits zero reward, for EVERY environment transition. -/
theorem blocked_is_noop (h : HarnessM) (envStep : Int → Int → Int × Int)
    (s a : Int) (hb : h.fA a = none) :
    stepH h envStep s a = (s, 0) := by
  simp [stepH, hb]

/-- A pass-through harness never alters the environment's transition. -/
theorem passthrough_step (envStep : Int → Int → Int × Int) (s a : Int) :
    stepH idHarness envStep s a = envStep s a := rfl

/-- BudgetPolicy stop rules (orchestration/budget.py). -/
def fixedStop (k attempts : Nat) : Bool := decide (k ≤ attempts)

def cappedStop (maxK attempts : Nat) (accepted : Bool) : Bool :=
  accepted || decide (maxK ≤ attempts)

def objStop (maxK attempts : Nat) (accepted scoreOK : Bool) : Bool :=
  decide (maxK ≤ attempts) || accepted || scoreOK

/-- FixedBudget halts at its cap. -/
theorem fixed_halts (k a : Nat) (h : k ≤ a) : fixedStop k a = true := by
  simpa [fixedStop] using h

/-- CappedAdaptive halts at its cap regardless of the LLM's decision. -/
theorem capped_halts (maxK a : Nat) (acc : Bool) (h : maxK ≤ a) :
    cappedStop maxK a acc = true := by
  cases acc with
  | true => rfl
  | false => simpa [cappedStop] using h

/-- CappedAdaptive halts immediately on ACCEPT. -/
theorem capped_accept_halts (maxK a : Nat) :
    cappedStop maxK a true = true := rfl

/-- ObjectiveDriven halts at its cap regardless of decision and score. -/
theorem obj_halts (maxK a : Nat) (acc ok : Bool) (h : maxK ≤ a) :
    objStop maxK a acc ok = true := by
  have hd : decide (maxK ≤ a) = true := by simpa using h
  simp [objStop, hd]

/-- DifficultyZone band membership in exact integer arithmetic (all
    quantities in any common fixed-point scale): sr lies in [lo, hi]
    iff the doubled center-distance 2*sr - (lo+hi) is within the band
    width hi - lo on both sides. -/
theorem dz_band_iff (lo hi sr : Int) :
    (lo ≤ sr ∧ sr ≤ hi) ↔
    (-(hi - lo) ≤ 2 * sr - (lo + hi) ∧ 2 * sr - (lo + hi) ≤ hi - lo) := by
  omega

/-- The rounding-normalization gap in _weights_from_failure_axes:
    fixed-precision weights need not sum to unity. Axis counts
    (0,0,0,0,1) give exact inverse weights (2,2,2,2,1)/9; the per-mille
    floors sum to 999, not 1000. -/
theorem weights_round_gap : 4 * (2000 / 9) + 1000 / 9 = 999 := by decide

/-- The exact-arithmetic weights are exactly normalized: the numerators
    sum to the common denominator. -/
theorem weights_exact_sum : 2 + 2 + 2 + 2 + 1 = 9 := by decide


end CurvedCorpus
