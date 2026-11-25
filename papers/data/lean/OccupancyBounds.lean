import Mathlib.Analysis.PSeries
import Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Ring
import Mathlib.Tactic.Positivity
import Mathlib.Tactic.Linarith

/-! Paper 5. Energies and amounts are real. Empirical claims live in the replay.
The right-angle hypothesis specifies the spherical triangle. No claim about
the existence of an orthogonal pair of semantic directions follows from it. -/
noncomputable section
namespace Occupancy
open Finset
open scoped BigOperators
variable {I C Q : Type*} [Fintype I] [Fintype C] [Fintype Q]

def gibbs (g E : I → ℝ) (T : ℝ) (i : I) : ℝ := g i * Real.exp (-E i / T)
def fraction (w : I → ℝ) (i : I) : ℝ := w i / ∑ j, w j

theorem partition_positive [Nonempty I] (g E : I → ℝ) (T : ℝ) (hg : ∀ i, 0 < g i) :
    0 < ∑ i, gibbs g E T i :=
  Finset.sum_pos (fun i _ => mul_pos (hg i) (Real.exp_pos _)) Finset.univ_nonempty

theorem fractions_sum (w : I → ℝ) (h : (∑ i, w i) ≠ 0) :
    ∑ i, fraction w i = 1 := by simp only [fraction, div_eq_mul_inv, ← Finset.sum_mul, mul_inv_cancel₀ h]

theorem total_amount (a : Q → ℝ) (p : Q → C → ℝ) (h : ∀ q, ∑ c, p q c = 1) :
    ∑ c, ∑ q, a q * p q c = ∑ q, a q := by
  rw [Finset.sum_comm]
  simp_rw [← Finset.mul_sum, h, mul_one]

theorem bytes_per_entity (B A : ℝ) (h : A ≠ 0) : A * (B / A) = B := by field_simp
theorem molar_exponent (N e k T : ℝ) (h : N ≠ 0) :
    N*e/(N*k*T) = e/(k*T) := by rw [mul_assoc]; exact mul_div_mul_left _ _ h

theorem molecular_total (mass molarMass avogadro : ℝ) (w : I → ℝ)
    (h : (∑ i, w i) ≠ 0) :
    ∑ i, (mass/molarMass*avogadro) * fraction w i = mass/molarMass*avogadro := by
  rw [← Finset.mul_sum, fractions_sum w h, mul_one]

theorem uniform_replication (S n copies : ℝ) (h : copies ≠ 0) :
    (copies*S)/(copies*n) = S/n := mul_div_mul_left _ _ h

theorem cubic_shell_count (d j : ℕ) :
    ((Finset.univ : Finset (Fin d)).powersetCard j).card = d.choose j := by simp

theorem regroup_shells (f : I → ℝ) (shell : I → ℕ) (d : ℕ) (hs : ∀ i, shell i ≤ d) :
    ∑ h ∈ range (d+1), ∑ i, (if shell i = h then f i else 0) = ∑ i, f i := by
  rw [sum_comm]
  simp [Nat.lt_succ_of_le (hs _)]

theorem right_energy (a b c : ℝ) (h : Real.cos c = Real.cos a * Real.cos b) :
    1-Real.cos c = (1-Real.cos a)+(1-Real.cos b)-(1-Real.cos a)*(1-Real.cos b) := by
  rw [h]; ring

theorem lift_unit (x y : ℝ) :
    (2*x/(1+x^2+y^2))^2 + (2*y/(1+x^2+y^2))^2 +
    ((x^2+y^2-1)/(1+x^2+y^2))^2 = 1 := by
  have h : 0 < 1+x^2+y^2 := by positivity
  field_simp; nlinarith only [h]

-- Tangential squared radius t subsumes any finite embedding dimension.
theorem ambient_lift_unit (t : ℝ) (ht : 0 ≤ t) :
    4*t/(1+t)^2 + ((1-t)/(1+t))^2 = 1 := by
  have h : 0 < 1+t := by linarith
  field_simp; ring

theorem inverse_plane_power (x s : ℝ) (hs : s ≠ 0) : (s*x)/s = x := by field_simp
theorem energy_temperature_scale (e T s : ℝ) (hs : s ≠ 0) :
    Real.exp (-(s*e)/(s*T)) = Real.exp (-e/T) := by
  rw [← mul_neg, mul_div_mul_left _ _ hs]

theorem dyadic_level (n : ℕ) (m : ℝ) :
    (2:ℝ)^n * (m / (2^n * ((n:ℝ)+1))) = m/((n:ℝ)+1) := by
  have h : (2:ℝ)^n ≠ 0 := by positivity
  field_simp

theorem dyadic_partial (N : ℕ) (m : ℝ) :
    (∑ n ∈ range N, (2:ℝ)^n * (m/(2^n*((n:ℝ)+1)))) =
    m * ∑ n ∈ range N, 1/((n:ℝ)+1) := by
  simp only [dyadic_level, Finset.mul_sum, mul_one_div]

theorem dyadic_diverges (m : ℝ) (hm : 0 < m) :
    Filter.Tendsto (fun N => ∑ n ∈ range N, (2:ℝ)^n * (m/(2^n*((n:ℝ)+1))))
      Filter.atTop Filter.atTop := by
  simp_rw [dyadic_partial]
  exact Filter.Tendsto.const_mul_atTop hm Real.tendsto_sum_range_one_div_nat_succ_atTop

theorem heat_power (l t : ℝ) :
    (Real.exp (-(l*(l+1))*t))^2 = Real.exp (-2*l*(l+1)*t) := by
  rw [sq, ← Real.exp_add]; congr 1; ring

/-- A finite Gram identity, including sampled nonorthogonal learned features. -/
theorem gram_power (x : Q → I → ℝ) (b : I → ℝ) :
    ∑ q, (∑ i, b i*x q i)^2 =
    ∑ q, ∑ i, ∑ j, (b i*b j)*(x q i*x q j) := by
  simp_rw [sq, Finset.sum_mul, Finset.mul_sum]
  apply Finset.sum_congr rfl; intro q _
  apply Finset.sum_congr rfl; intro i _
  apply Finset.sum_congr rfl; intro j _
  ring

theorem walsh_butterfly (a b : ℝ) : (a+b)^2+(a-b)^2=2*(a^2+b^2) := by ring

def bitTerm (r : ℝ) (mask bit : Bool) : ℝ :=
  if bit then (if mask then -r else r) else 1

/-- The genuine Walsh coefficient of the product Hamming kernel, as a sum over all bit vectors. -/
theorem walsh_hamming (d : ℕ) (mask : Fin d → Bool) (r : ℝ) :
    (∑ x : Fin d → Bool, ∏ i, bitTerm r (mask i) (x i)) =
      ∏ i, (if mask i then 1-r else 1+r) := by
  rw [← Fintype.prod_sum]
  apply Finset.prod_congr rfl; intro i _
  cases mask i <;> simp [bitTerm] <;> ring

theorem degree_response (r : ℝ) (j k : ℕ) (h : 1+r ≠ 0) :
    ((1-r)^j*(1+r)^k)/(1+r)^(j+k) = ((1-r)/(1+r))^j := by
  rw [pow_add, div_pow]; field_simp

theorem free_energy_weight (g E T : ℝ) (hg : 0 < g) (ht : T ≠ 0) :
    Real.exp (-(E-T*Real.log g)/T) = g*Real.exp (-E/T) := by
  have eq : -(E-T*Real.log g)/T = Real.log g + -E/T := by field_simp; ring
  rw [eq, Real.exp_add, Real.exp_log hg]

theorem collision_pairs (h : I → ℝ) :
    ∑ i, h i*(h i-1) = (∑ i, h i^2) - ∑ i, h i := by
  rw [← Finset.sum_sub_distrib]
  apply Finset.sum_congr rfl; intro i _; ring

theorem db_cascade (a b : ℝ) (ha : a ≠ 0) (hb : b ≠ 0) :
    20*Real.log |a*b|/Real.log 10 =
    20*Real.log |a|/Real.log 10 + 20*Real.log |b|/Real.log 10 := by
  rw [abs_mul, Real.log_mul (abs_ne_zero.mpr ha) (abs_ne_zero.mpr hb)]; ring

theorem renyi_collision (s : ℝ) (hs : 0 < s) :
    Real.exp (-(Real.log s / Real.log 2)*Real.log 2) = 1/s := by
  have h : Real.log 2 ≠ 0 := ne_of_gt (Real.log_pos (by norm_num))
  have e : -(Real.log s / Real.log 2)*Real.log 2 = -Real.log s := by field_simp
  rw [e, Real.exp_neg, Real.exp_log hs, one_div]

theorem prefix_gain_add (a b c : ℝ) (ha : a ≠ 0) (hb : b ≠ 0) (hc : c ≠ 0) :
    Real.log (b/a) + Real.log (c/b) = Real.log (c/a) := by
  simp only [Real.log_div hb ha, Real.log_div hc hb,
    Real.log_div hc ha]; ring

theorem spacing_ratio_bounds (a b : ℝ) (ha : 0 ≤ a) (hb : 0 ≤ b) (h : 0 < max a b) :
    0 ≤ min a b / max a b ∧ min a b / max a b ≤ 1 := by
  exact ⟨div_nonneg (le_min ha hb) h.le, (div_le_one h).2 ((min_le_left _ _).trans (le_max_left _ _))⟩

theorem finite_convolution {G : Type*} [Fintype G] [AddCommGroup G]
    (f k χ : G → ℝ) (character : ∀ x y, χ (x+y) = χ x * χ y) :
    (∑ x, (∑ y, f y * k (x-y))*χ x) = (∑ y, f y*χ y)*(∑ z, k z*χ z) := by
  simp_rw [Finset.sum_mul]
  rw [Finset.sum_comm]
  apply Finset.sum_congr rfl
  intro y _
  rw [← Equiv.sum_comp (Equiv.addRight y) (fun x => f y*k (x-y)*χ x)]
  change (∑ z, f y*k (z+y-y)*χ (z+y)) = _
  simp only [add_sub_cancel_right, character, Finset.mul_sum]
  apply Finset.sum_congr rfl
  intro z _
  ring

theorem square_amplitudes_summable (m : ℝ) :
    Summable (fun n : ℕ => (2:ℝ)^n*(m/(2^n*((n:ℝ)+1)))^2) := by
  apply Summable.of_nonneg_of_le (fun n => by positivity) _
    ((summable_geometric_of_lt_one (by norm_num : 0 ≤ (1/2:ℝ)) (by norm_num)).mul_left (m^2))
  intro n
  rw [div_pow (1:ℝ) 2 n, one_pow]
  have hn : 0 < (2:ℝ)^n := by positivity
  have h1 : 0 < (n:ℝ)+1 := by positivity
  have eq : (2:ℝ)^n*(m/(2^n*((n:ℝ)+1)))^2 =
      (m^2 / ((n:ℝ)+1)^2) / 2^n := by field_simp
  rw [eq, mul_one_div]
  apply div_le_div_of_nonneg_right _ hn.le
  apply (div_le_iff₀ (sq_pos_of_pos h1)).2
  have one : 1 ≤ ((n:ℝ)+1)^2 := by nlinarith [Nat.cast_nonneg (α := ℝ) n, sq_nonneg (n:ℝ)]
  simpa using mul_le_mul_of_nonneg_left one (sq_nonneg m)

theorem finite_parseval [DecidableEq I] (x : Q → I → ℝ) (b : I → ℝ) (N : ℝ)
    (orth : ∀ i j, ∑ q, x q i*x q j = if i=j then N else 0) :
    ∑ q, (∑ i, b i*x q i)^2 = N * ∑ i, (b i)^2 := by
  rw [gram_power, Finset.sum_comm, Finset.mul_sum]
  apply Finset.sum_congr rfl; intro i _
  rw [Finset.sum_comm]
  simp_rw [← Finset.mul_sum, orth]
  simp [mul_ite, sq, mul_comm]

/-- A spherical octant is a right geodesic triangle with all arcs π/2. -/
theorem right_octant :
    Real.cos (Real.pi/2) = Real.cos (Real.pi/2)*Real.cos (Real.pi/2) ∧
    (Real.pi/2)^2 < (Real.pi/2)^2+(Real.pi/2)^2 := by
  constructor
  · simp
  · have h : 0 < (Real.pi / 2)^2 := sq_pos_of_pos (by positivity)
    linarith

/-- Connect the positive weighted partition directly to conserved query amounts. -/
theorem gibbs_corpus_balance [Nonempty C] (a : Q → ℝ) (g E : Q → C → ℝ)
    (T : ℝ) (hg : ∀ q c, 0 < g q c) :
    ∑ c, ∑ q, a q * fraction (gibbs (g q) (E q) T) c = ∑ q, a q :=
  total_amount a _ (fun q => fractions_sum _ (partition_positive _ _ _ (hg q)).ne')

end Occupancy
