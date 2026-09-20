/-
  AzimuthBounds.lean — azimuth/1 (2026-09-19), core Lean 4.33.0, no Mathlib, no sorry.

  Exact integer statements behind the wayfinder's rotation-invariant azimuth
  diagnostics. The runtime statistic is Z_m = N * |mean(exp(i*m*phi))|^2 on the
  placement-plane angles phi = atan2(PC2, PC1).

  Model: a complex number with integer coordinates is a pair (re, im) of Ints;
  the modulus-squared quadratic form is absSq z = re*re + im*im.

  The PCA gauge group over Z[i] is the dihedral group D4 (units +-1, +-i plus
  conjugation): sign flips, axis swap, quarter rotation and reflection. Every
  element preserves absSq exactly. These are the gauge symmetries the runtime
  statistic genuinely has; the full SO(2) rotation invariance is a real/Float
  statement and is a NONCLAIM here.

  Proved:
    sq_nonneg            0 <= a*a
    absSq_nonneg         |z|^2 >= 0
    absSq_neg            negating the plane preserves |z|^2
    absSq_conj           reflection phi -> -phi preserves |z|^2
    absSq_swap           axis swap PC1<->PC2 preserves |z|^2
    absSq_quarter        quarter rotation preserves |z|^2
    cadd_comm/absSq      order-independence of the moment sum
    sum_replicate        repeating every row k times scales the moment sum by k
                         (atomicity: duplicates carry multiplicity, they are not
                         new angular evidence)
    absSq_scale          scaling every row by k scales |moment|^2 by k^2
    decide instances     concrete D4 checks

  Scope (see azimuth-scope.json): integer identities about finite lists of
  integer pairs. They say NOTHING about the null distribution of Z_m, any
  p-value or tail, whether the corpus has angular structure, invariance under
  anisotropic (GL(2)) rescaling of the placement axes, or Float rounding. The
  runtime path uses Float and is checked by tests, not by this file.
-/

namespace Azimuth

/-- complex number with integer coordinates -/
def Cx : Type := Int × Int

/-- squared modulus |z|^2 = re^2 + im^2 -/
def absSq (z : Cx) : Int := z.1 * z.1 + z.2 * z.2

/-- componentwise addition -/
def cadd (a b : Cx) : Cx := (a.1 + b.1, a.2 + b.2)

/-- componentwise integer scaling -/
def scale (k : Int) (z : Cx) : Cx := (k * z.1, k * z.2)

/-- negation of the whole plane -/
def cneg (z : Cx) : Cx := (-z.1, -z.2)

/-- reflection phi -> -phi -/
def cconj (z : Cx) : Cx := (z.1, -z.2)

/-- axis swap PC1 <-> PC2 -/
def cswap (z : Cx) : Cx := (z.2, z.1)

/-- quarter rotation -/
def cquarter (z : Cx) : Cx := (-z.2, z.1)

theorem sq_nonneg (a : Int) : 0 ≤ a * a := by
  cases Int.le_total 0 a with
  | inl h => exact Int.mul_nonneg h h
  | inr h =>
    have h' : 0 ≤ -a := Int.neg_nonneg_of_nonpos h
    have e : a * a = (-a) * (-a) := by rw [Int.neg_mul_neg]
    rw [e]
    exact Int.mul_nonneg h' h'

theorem absSq_nonneg (z : Cx) : 0 ≤ absSq z := by
  unfold absSq
  exact Int.add_nonneg (sq_nonneg z.1) (sq_nonneg z.2)

theorem absSq_neg (z : Cx) : absSq (cneg z) = absSq z := by
  unfold absSq cneg
  rw [Int.neg_mul_neg, Int.neg_mul_neg]

theorem absSq_conj (z : Cx) : absSq (cconj z) = absSq z := by
  unfold absSq cconj
  rw [Int.neg_mul_neg]

theorem absSq_swap (z : Cx) : absSq (cswap z) = absSq z := by
  unfold absSq cswap
  rw [Int.add_comm]

theorem absSq_quarter (z : Cx) : absSq (cquarter z) = absSq z := by
  unfold absSq cquarter
  rw [Int.neg_mul_neg, Int.add_comm]

theorem cadd_comm (a b : Cx) : cadd a b = cadd b a := by
  unfold cadd
  rw [Int.add_comm a.1 b.1, Int.add_comm a.2 b.2]

/-- The moment sum is order-independent (dedup keeps first occurrences; the
    statistic cannot tell). -/
theorem absSq_sum_order (a b : Cx) : absSq (cadd a b) = absSq (cadd b a) := by
  rw [cadd_comm]

theorem sum_replicate : ∀ (k : Nat) (z : Cx), List.foldr cadd (0,0) (List.replicate k z) = scale (k : Int) z
  | 0, _ => rfl
  | (n+1), z => by
      show cadd z (List.foldr cadd (0,0) (List.replicate n z)) = scale ((n: Int) + 1) z
      rw [sum_replicate n z]
      unfold scale cadd
      simp [Int.mul_add, Int.one_mul, Int.add_comm]

theorem absSq_scale (k : Int) (z : Cx) : absSq (scale k z) = k * k * absSq z := by
  unfold absSq scale
  have h1 : k * z.1 * (k * z.1) = k * k * (z.1 * z.1) := by
    rw [Int.mul_assoc k z.1 (k * z.1), Int.mul_comm z.1 (k * z.1), Int.mul_assoc k z.1 z.1,
        ← Int.mul_assoc k k (z.1 * z.1)]
  have h2 : k * z.2 * (k * z.2) = k * k * (z.2 * z.2) := by
    rw [Int.mul_assoc k z.2 (k * z.2), Int.mul_comm z.2 (k * z.2), Int.mul_assoc k z.2 z.2,
        ← Int.mul_assoc k k (z.2 * z.2)]
  rw [h1, h2, ← Int.mul_add]

/-! ## Concrete D4 instances (decide) -/

def z1 : Cx := (3, -4)

theorem check_neg : absSq (cneg z1) = absSq z1 := by decide
theorem check_conj : absSq (cconj z1) = absSq z1 := by decide
theorem check_swap : absSq (cswap z1) = absSq z1 := by decide
theorem check_quarter : absSq (cquarter z1) = absSq z1 := by decide
theorem check_nonneg : 0 ≤ absSq z1 := by decide

/-! ## Printed axiom obligations -/

#print axioms sq_nonneg
#print axioms absSq_nonneg
#print axioms absSq_neg
#print axioms absSq_conj
#print axioms absSq_swap
#print axioms absSq_quarter
#print axioms cadd_comm
#print axioms absSq_sum_order
#print axioms sum_replicate
#print axioms absSq_scale
#print axioms check_neg
#print axioms check_conj
#print axioms check_swap
#print axioms check_quarter
#print axioms check_nonneg

end Azimuth
