/-
  FocalBounds.lean
  Exact counting identities behind the "dimensional focal point" of a corpus
  point map: how many items stay distinguishable when each item code is
  truncated to its first d bits.

  Core Lean 4 only (pinned toolchain: leanprover/lean4:v4.33.0).
  No mathlib, no Batteries, no external import, no `sorry`,
  no placeholder / axiom-only declaration.

  Companion scope manifest: papers/data/lean/focal-scope.json
  Axiom gate:               papers/data/lean/verify_wayfinder_axioms.py
                            (reused unchanged, invoked with
                             --manifest papers/data/lean/focal-scope.json)

  ---------------------------------------------------------------------------
  CONVENTIONS

  * An item code is a `List Bool`. The d-bit prefix of a code is
    `List.take d code`. Two items are DISTINGUISHABLE at depth d iff their
    d-bit prefixes differ.
  * `dedup` is defined here (it keeps the LAST occurrence of each element);
    `distinctCount l` is the length of `dedup l`.
  * `prefixCount codes d` is the number of distinct d-bit prefixes, i.e. the
    number of distinguishable classes at depth d.
  * `focalDim gains t` is the length of the longest initial run of per-axis
    gains meeting the threshold. Gains and threshold are `Nat` numerators
    over one common positive denominator D, so `t <= g` is exactly
    `t/D <= g/D`.

  ---------------------------------------------------------------------------
  WHAT IS PROVED

  (A) Generic distinct-count facts: `dedup` has the same members as its
      input, has no duplicates, and is no longer than its input; a duplicate-
      free list contained in another list is no longer than it; distinct
      counts never increase under a map, are invariant under permutation,
      and at most double when each image has one of two refinements.
  (B) Prefix ladder: refining by one bit never merges classes (T1); one bit
      at most doubles the class count when every code has a next bit (T2);
      at depth d there are at most 2^d classes when every code has at least
      d bits (T3); the count never exceeds the number of items (T4).
  (C) Selection rule: `focalDim` is bounded by the number of axes, every
      axis before it meets the threshold, the axis at it (if any) fails the
      threshold, and it is the largest index with that property (T5).

  ---------------------------------------------------------------------------
  NON-CLAIMS

  * Nothing about floating point, PCA / principal axes, eigen-decompositions,
    variance-explained ratios, or covering / packing numbers of real point
    sets is proved here. The codes are an abstract input; how the runtime
    quantizes coordinates into bits is a RUNTIME obligation.
  * No claim is made that the observed prefix ladder of any corpus attains
    the 2^d bound, or that `focalDim` matches any notion of intrinsic
    dimension. The gain numerators are supplied by the caller.
  * No probabilistic, statistical, or calibration claim follows from any
    statement in this file.
-/

namespace FocalBounds

/-- Duplicate removal (keeps the last occurrence of each element). -/
def dedup {α : Type} [DecidableEq α] : List α → List α
  | [] => []
  | a :: l => if a ∈ dedup l then dedup l else a :: dedup l

/-- Number of distinct elements of a list. -/
def distinctCount {α : Type} [DecidableEq α] (l : List α) : Nat :=
  (dedup l).length

/-- Number of distinct d-bit prefixes among the item codes. -/
def prefixCount (codes : List (List Bool)) (d : Nat) : Nat :=
  distinctCount (codes.map (List.take d))

/-- Length of the longest initial run of gains meeting the threshold `t`. -/
def focalDim : List Nat → Nat → Nat
  | [], _ => 0
  | g :: gs, t => if t ≤ g then focalDim gs t + 1 else 0

-- (A) generic distinct-count facts ------------------------------------------

theorem mem_dedup {α : Type} [DecidableEq α] (x : α) (l : List α) :
    x ∈ dedup l ↔ x ∈ l := by
  induction l generalizing x with
  | nil => simp [dedup]
  | cons a l ih =>
    by_cases h : a ∈ dedup l
    · rw [show dedup (a :: l) = dedup l from if_pos h, ih x, List.mem_cons]
      rw [ih a] at h
      constructor
      · intro hx; exact Or.inr hx
      · intro hx
        cases hx with
        | inl e => rw [e]; exact h
        | inr hx => exact hx
    · rw [show dedup (a :: l) = a :: dedup l from if_neg h, List.mem_cons, List.mem_cons, ih x]

theorem dedup_nodup {α : Type} [DecidableEq α] (l : List α) :
    (dedup l).Nodup := by
  induction l with
  | nil => simp [dedup]
  | cons a l ih =>
    by_cases h : a ∈ dedup l
    · simp only [dedup, if_pos h]; exact ih
    · simp only [dedup, if_neg h]; exact List.nodup_cons.mpr ⟨h, ih⟩

theorem dedup_length_le {α : Type} [DecidableEq α] (l : List α) :
    (dedup l).length ≤ l.length := by
  induction l with
  | nil => simp [dedup]
  | cons a l ih =>
    by_cases h : a ∈ dedup l
    · simp only [dedup, if_pos h, List.length_cons]; omega
    · simp only [dedup, if_neg h, List.length_cons]; omega

theorem nodup_subset_length_le {α : Type} [DecidableEq α] :
    ∀ (l L : List α), l.Nodup → (∀ x, x ∈ l → x ∈ L) → l.length ≤ L.length
  | [], _, _, _ => Nat.zero_le _
  | a :: l, L, hnd, hsub => by
    have hcons := List.nodup_cons.mp hnd
    have haL : a ∈ L := hsub a (by simp)
    have ih := nodup_subset_length_le l (L.erase a) hcons.2 (fun x hx => by
      have hxa : x ≠ a := fun e => hcons.1 (e ▸ hx)
      exact (List.mem_erase_of_ne hxa).mpr (hsub x (by simp [hx])))
    have hlen := List.length_erase_of_mem haL
    have hpos := List.length_pos_of_mem haL
    simp only [List.length_cons]
    omega

theorem distinctCount_le_length {α : Type} [DecidableEq α] (l : List α) :
    distinctCount l ≤ l.length :=
  dedup_length_le l

theorem distinctCount_map_le {α β : Type} [DecidableEq α] [DecidableEq β]
    (g : α → β) (l : List α) :
    distinctCount (l.map g) ≤ distinctCount l := by
  have key := nodup_subset_length_le (dedup (l.map g)) ((dedup l).map g)
    (dedup_nodup _) (fun z hz => by
      rw [mem_dedup, List.mem_map] at hz
      obtain ⟨y, hy, e⟩ := hz
      exact List.mem_map.mpr ⟨y, (mem_dedup y l).mpr hy, e⟩)
  rw [List.length_map] at key
  exact key

theorem distinctCount_congr {α : Type} [DecidableEq α] (l l' : List α)
    (h : ∀ x, x ∈ l ↔ x ∈ l') :
    distinctCount l = distinctCount l' := by
  apply Nat.le_antisymm
  · exact nodup_subset_length_le _ _ (dedup_nodup l) (fun x hx => by
      rw [mem_dedup] at hx ⊢; exact (h x).mp hx)
  · exact nodup_subset_length_le _ _ (dedup_nodup l') (fun x hx => by
      rw [mem_dedup] at hx ⊢; exact (h x).mpr hx)

theorem distinctCount_perm {α : Type} [DecidableEq α] (l l' : List α)
    (h : l.Perm l') :
    distinctCount l = distinctCount l' :=
  distinctCount_congr l l' (fun _ => h.mem_iff)

theorem distinctCount_two_choice {α β γ : Type} [DecidableEq β] [DecidableEq γ]
    (l : List α) (g : α → β) (k : α → γ) (u v : β → γ)
    (hc : ∀ x, x ∈ l → k x = u (g x) ∨ k x = v (g x)) :
    distinctCount (l.map k) ≤ 2 * distinctCount (l.map g) := by
  have key := nodup_subset_length_le (dedup (l.map k))
    ((dedup (l.map g)).map u ++ (dedup (l.map g)).map v)
    (dedup_nodup _) (fun z hz => by
      rw [mem_dedup, List.mem_map] at hz
      obtain ⟨x, hx, e⟩ := hz
      have hgx : g x ∈ dedup (l.map g) :=
        (mem_dedup _ _).mpr (List.mem_map.mpr ⟨x, hx, rfl⟩)
      rw [← e]
      cases hc x hx with
      | inl e1 =>
        rw [e1]; exact List.mem_append.mpr (Or.inl (List.mem_map.mpr ⟨g x, hgx, rfl⟩))
      | inr e2 =>
        rw [e2]; exact List.mem_append.mpr (Or.inr (List.mem_map.mpr ⟨g x, hgx, rfl⟩)))
  rw [List.length_append, List.length_map, List.length_map] at key
  unfold distinctCount
  omega

-- (B) prefix ladder ---------------------------------------------------------

theorem prefix_count_mono (codes : List (List Bool)) (d : Nat) :
    prefixCount codes d ≤ prefixCount codes (d + 1) := by
  have e : codes.map (List.take d) =
      (codes.map (List.take (d + 1))).map (List.take d) := by
    rw [List.map_map]
    apply List.map_congr_left
    intro c _
    simp [List.take_take, Nat.min_eq_left (Nat.le_succ d)]
  unfold prefixCount
  rw [e]
  exact distinctCount_map_le _ _

theorem prefix_count_mono_le (codes : List (List Bool)) (d e : Nat) (h : d ≤ e) :
    prefixCount codes d ≤ prefixCount codes e := by
  induction e with
  | zero =>
    have hd : d = 0 := by omega
    rw [hd]; exact Nat.le_refl _
  | succ e ih =>
    by_cases hde : d = e + 1
    · rw [hde]; exact Nat.le_refl _
    · exact Nat.le_trans (ih (by omega)) (prefix_count_mono codes e)

theorem prefix_count_double (codes : List (List Bool)) (d : Nat)
    (h : ∀ c, c ∈ codes → d + 1 ≤ c.length) :
    prefixCount codes (d + 1) ≤ 2 * prefixCount codes d := by
  unfold prefixCount
  apply distinctCount_two_choice codes (List.take d) (List.take (d + 1))
    (fun p => p ++ [false]) (fun p => p ++ [true])
  intro c hc
  have hd : d < c.length := h c hc
  rw [List.take_add_one, List.getElem?_eq_getElem hd]
  generalize c[d] = b
  cases b <;> simp

theorem prefix_count_zero_le_one (codes : List (List Bool)) :
    prefixCount codes 0 ≤ 1 := by
  unfold prefixCount distinctCount
  have key := nodup_subset_length_le (dedup (codes.map (List.take 0))) [[]]
    (dedup_nodup _) (fun x hx => by
      rw [mem_dedup, List.mem_map] at hx
      obtain ⟨c, _, e⟩ := hx
      rw [← e]; simp)
  exact key

theorem prefix_count_pow (codes : List (List Bool)) (d : Nat)
    (h : ∀ c, c ∈ codes → d ≤ c.length) :
    prefixCount codes d ≤ 2 ^ d := by
  revert h
  induction d with
  | zero => intro _; exact prefix_count_zero_le_one codes
  | succ d ih =>
    intro h
    have h1 := prefix_count_double codes d h
    have h2 := ih (fun c hc => Nat.le_of_succ_le (h c hc))
    rw [Nat.pow_succ]
    omega

theorem prefix_count_le_length (codes : List (List Bool)) (d : Nat) :
    prefixCount codes d ≤ codes.length := by
  unfold prefixCount
  have key := distinctCount_le_length (codes.map (List.take d))
  rw [List.length_map] at key
  exact key

-- (C) selection rule --------------------------------------------------------

theorem focalDim_le_length (gains : List Nat) (t : Nat) :
    focalDim gains t ≤ gains.length := by
  induction gains with
  | nil => simp [focalDim]
  | cons g gs ih =>
    by_cases ht : t ≤ g
    · simp only [focalDim, if_pos ht, List.length_cons]; omega
    · simp only [focalDim, if_neg ht, List.length_cons]; omega

theorem focalDim_prefix_meets (gains : List Nat) (t i : Nat)
    (h : i < focalDim gains t) :
    ∃ g, gains[i]? = some g ∧ t ≤ g := by
  induction gains generalizing i with
  | nil => simp [focalDim] at h
  | cons g gs ih =>
    by_cases ht : t ≤ g
    · simp only [focalDim, if_pos ht] at h
      cases i with
      | zero => exact ⟨g, by simp, ht⟩
      | succ i =>
        obtain ⟨g', hg', ht'⟩ := ih i (by omega)
        exact ⟨g', by simp [hg'], ht'⟩
    · simp only [focalDim, if_neg ht] at h
      omega

theorem focalDim_stop_fails (gains : List Nat) (t : Nat)
    (h : focalDim gains t < gains.length) :
    ∃ g, gains[focalDim gains t]? = some g ∧ g < t := by
  induction gains with
  | nil => simp at h
  | cons g gs ih =>
    by_cases ht : t ≤ g
    · simp only [focalDim, if_pos ht, List.length_cons] at h ⊢
      obtain ⟨g', hg', ht'⟩ := ih (by omega)
      exact ⟨g', by simp [hg'], ht'⟩
    · simp only [focalDim, if_neg ht]
      exact ⟨g, by simp, by omega⟩

theorem focalDim_maximal (gains : List Nat) (t n : Nat)
    (h : ∀ i, i < n → ∃ g, gains[i]? = some g ∧ t ≤ g) :
    n ≤ focalDim gains t := by
  induction gains generalizing n with
  | nil =>
    cases n with
    | zero => exact Nat.le_refl _
    | succ n =>
      obtain ⟨g, hg, _⟩ := h 0 (by omega)
      simp at hg
  | cons g gs ih =>
    cases n with
    | zero => exact Nat.zero_le _
    | succ n =>
      obtain ⟨g0, hg0, ht0⟩ := h 0 (by omega)
      have hgg : g0 = g := by simp at hg0; exact hg0.symm
      have ht : t ≤ g := hgg ▸ ht0
      simp only [focalDim, if_pos ht]
      have := ih n (fun i hi => by
        obtain ⟨g', hg', ht'⟩ := h (i + 1) (by omega)
        exact ⟨g', by simpa using hg', ht'⟩)
      omega

#print axioms mem_dedup
#print axioms dedup_nodup
#print axioms dedup_length_le
#print axioms nodup_subset_length_le
#print axioms distinctCount_le_length
#print axioms distinctCount_map_le
#print axioms distinctCount_congr
#print axioms distinctCount_perm
#print axioms distinctCount_two_choice

/-! ### (D) Recursion: re-applying the pipeline to its own output

`focalDim_take_self` / `focalDim_refreeze_fixed`: when the instrument is
re-frozen at d = n* on the same frame, the re-mapped gains are the first n*
gains, and the focal rule then selects every axis: one step reaches a fixed
point.  `antitone_stabilizes` / `recode_stabilizes`: if each recursion step
assigns the next codes as a function of the current codes (sphere position as
a function of the bit class, and the new bits as a function of the position),
the class count never increases (`distinctCount_map_le`) and therefore repeats
within `distinctCount l` steps. -/

theorem focalDim_take_self (gains : List Nat) (t : Nat) :
    focalDim (gains.take (focalDim gains t)) t = focalDim gains t := by
  induction gains with
  | nil => simp [focalDim]
  | cons g gs ih =>
    by_cases ht : t ≤ g
    · simp only [focalDim, if_pos ht, List.take_succ_cons]
      rw [ih]
    · simp only [focalDim, if_neg ht, List.take_zero]

theorem focalDim_refreeze_fixed (gains : List Nat) (t : Nat) :
    focalDim (gains.take (focalDim gains t)) t =
      (gains.take (focalDim gains t)).length := by
  rw [focalDim_take_self, List.length_take]
  have h := focalDim_le_length gains t
  omega

theorem antitone_drop (f : Nat → Nat) (h : ∀ k, f (k + 1) ≤ f k)
    (hs : ∀ k, k ≤ f 0 → f (k + 1) ≠ f k) :
    ∀ k, k ≤ f 0 + 1 → f k + k ≤ f 0 := by
  intro k
  induction k with
  | zero => intro _; omega
  | succ k ih =>
    intro hk
    have h1 := ih (by omega)
    have h2 := h k
    have h3 := hs k (by omega)
    omega

theorem antitone_stabilizes (f : Nat → Nat) (h : ∀ k, f (k + 1) ≤ f k) :
    ∃ k, k ≤ f 0 ∧ f (k + 1) = f k := by
  apply Classical.byContradiction
  intro hne
  have hs : ∀ k, k ≤ f 0 → f (k + 1) ≠ f k := fun k hk heq => hne ⟨k, hk, heq⟩
  have := antitone_drop f h hs (f 0 + 1) (Nat.le_refl _)
  omega

/-- Codes after `k` recursion steps, each step recoding by `steps k`. -/
def recode {α : Type} (steps : Nat → α → α) (l : List α) : Nat → List α
  | 0 => l
  | k + 1 => (recode steps l k).map (steps k)

theorem recode_count_antitone {α : Type} [DecidableEq α]
    (steps : Nat → α → α) (l : List α) (k : Nat) :
    distinctCount (recode steps l (k + 1)) ≤ distinctCount (recode steps l k) :=
  distinctCount_map_le (steps k) (recode steps l k)

theorem recode_stabilizes {α : Type} [DecidableEq α]
    (steps : Nat → α → α) (l : List α) :
    ∃ k, k ≤ distinctCount l ∧
      distinctCount (recode steps l (k + 1)) = distinctCount (recode steps l k) := by
  obtain ⟨k, hk, he⟩ := antitone_stabilizes (fun k => distinctCount (recode steps l k))
    (recode_count_antitone steps l)
  exact ⟨k, hk, he⟩

#print axioms focalDim_take_self
#print axioms focalDim_refreeze_fixed
#print axioms antitone_drop
#print axioms antitone_stabilizes
#print axioms recode_count_antitone
#print axioms recode_stabilizes

#print axioms prefix_count_mono
#print axioms prefix_count_mono_le
#print axioms prefix_count_double
#print axioms prefix_count_zero_le_one
#print axioms prefix_count_pow
#print axioms prefix_count_le_length
#print axioms focalDim_le_length
#print axioms focalDim_prefix_meets
#print axioms focalDim_stop_fails
#print axioms focalDim_maximal

end FocalBounds
