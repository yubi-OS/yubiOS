/-
  RadiusBounds.lean
  Exact integer obligations behind the point-map radius-persistence diagnostics.

  Core Lean 4 only (pinned toolchain: leanprover/lean4:v4.33.0).
  No mathlib, no Batteries, no external import, no `sorry`,
  no placeholder / axiom-only declaration.

  Companion scope manifest: papers/data/lean/radius-scope.json
  Axiom gate:               papers/data/lean/verify_wayfinder_axioms.py
                            (reused unchanged, invoked with
                             --manifest papers/data/lean/radius-scope.json)

  ---------------------------------------------------------------------------
  CONVENTIONS (these must match the runtime exactly)

  * A pair is CONNECTED at radius `r` iff its distance satisfies `d < r`
    (STRICT). A tie `d = r` is therefore NOT an edge.
  * A point is ISOLATED at radius `r` iff no neighbour distance is below `r`,
    i.e. iff `r ≤ d` for its nearest-neighbour distance `d`. Ties fall on the
    OFF / ISOLATED side, which is exactly the complement of the strict edge
    predicate above. `conn_iso_complementary` pins this down in the kernel.

  * All quantities here are exact `Nat` / `Int`. The runtime works in
    floating-point chord distances on the 0.2 frame. Reducing those floats to
    exact integers (or to a certified integer-comparable order predicate),
    and the correctness of any float error budget, are RUNTIME obligations
    recorded in radius-scope.json — they are NOT proved here.

  ---------------------------------------------------------------------------
  WHAT IS PROVED

  (A) Radius antitonicity. The per-point isolation indicator, and hence the
      isolated count over a finite list of nearest-neighbour distances, is
      antitone in the radius: enlarging the radius never increases the
      isolated count. The count is also bounded by the number of points.

  (B) Conditional two-point perturbation bounds. Given a stated clearance
      premise and a stated bound `2*e` on how far a distance may move, an
      isolated pair stays non-adjacent and a connected pair stays adjacent.
      The bound on the distance change is a PREMISE supplied by the caller,
      not a Lean-proved property of the floating-point implementation.

  (C) A small exact clipped-window (rectangle) lemma set in integers: clipped
      extents are non-negative and bounded by the window extent, and the
      clipped integer area is non-negative and bounded by the window area.
      This is the integer skeleton of the clipped-area diagnostic only.

  ---------------------------------------------------------------------------
  NON-CLAIMS

  * The continuous / floating-point clipped area and the area/N ratio used by
    the runtime are RUNTIME-DERIVED quantities. Section 3 is an exact integer
    lemma set about clipped extents; it is NOT a kernel theorem about the
    runtime's float area, and no correspondence between the two is proved.
  * No floating-point error bound, no metric correspondence, no chord-distance
    identity, and no scaling law is proved here.
  * No probabilistic certificate, confidence interval, significance claim, or
    calibration claim follows from any statement in this file.
  * No Ginzburg-Landau / Allen-Cahn dynamics, vortex classification, winding
    number, physical phase, or thermodynamic statement follows from these
    statements.
  * No claim about prediction accuracy, prospective forecasting skill, ranking
    quality, semantic task grading, or any keep / revert / delete policy.
  * A checked theorem here certifies only that the corresponding exact integer
    identity holds; it carries no empirical content.
-/
namespace RadiusBounds

/-! ## 1. Radius antitonicity of the isolation indicator and count

`distance` is a point's nearest-neighbour distance and `radius` the query
radius, both as exact `Nat`. -/

/-- Isolation indicator at a radius: 1 when no neighbour is strictly inside.
Ties (`radius = distance`) count as ISOLATED. -/
def isoAt (distance radius : Nat) : Nat := if radius ≤ distance then 1 else 0

/-- Connectivity indicator at a radius: 1 when the neighbour is strictly
inside. Ties (`distance = radius`) are NOT edges. -/
def connAt (distance radius : Nat) : Nat := if distance < radius then 1 else 0

/-- The strict-edge and tie conventions are exact complements. -/
theorem conn_iso_complementary (distance radius : Nat) :
    connAt distance radius + isoAt distance radius = 1 := by
  simp only [connAt, isoAt]
  split <;> split <;> omega

/-- The indicator is a genuine 0/1 bit. -/
theorem isoAt_le_one (distance radius : Nat) : isoAt distance radius ≤ 1 := by
  simp only [isoAt]
  split <;> omega

/-- At radius 0 every point is isolated. -/
theorem isoAt_zero (distance : Nat) : isoAt distance 0 = 1 := by
  simp only [isoAt]
  split <;> omega

/-- Explicit tie convention: at `radius = distance` the point is ISOLATED,
because the runtime edge predicate is strict. -/
theorem isoAt_tie (distance : Nat) : isoAt distance distance = 1 := by
  simp only [isoAt]
  split <;> omega

/-- Per-point antitonicity in the radius. -/
theorem isoAt_antitone (distance r s : Nat) (h : r ≤ s) :
    isoAt distance s ≤ isoAt distance r := by
  simp only [isoAt]
  split <;> split <;> omega

/-- Isolated count over a finite list of nearest-neighbour distances. -/
def isoCount : List Nat → Nat → Nat
  | [], _ => 0
  | d :: ds, r => isoAt d r + isoCount ds r

theorem isoCount_nil (r : Nat) : isoCount [] r = 0 := rfl

theorem isoCount_cons (d : Nat) (ds : List Nat) (r : Nat) :
    isoCount (d :: ds) r = isoAt d r + isoCount ds r := rfl

/-- Radius antitonicity of the isolated count: enlarging the radius never
increases the number of isolated points. -/
theorem radius_count_antitone (distances : List Nat) (r s : Nat) (h : r ≤ s) :
    isoCount distances s ≤ isoCount distances r := by
  induction distances with
  | nil => simp [isoCount_nil]
  | cons d ds ih =>
      rw [isoCount_cons, isoCount_cons]
      exact Nat.add_le_add (isoAt_antitone d r s h) ih

/-- The isolated count never exceeds the number of points. -/
theorem isoCount_le_length (ds : List Nat) (r : Nat) :
    isoCount ds r ≤ ds.length := by
  induction ds with
  | nil => simp [isoCount_nil]
  | cons d ds ih =>
      rw [isoCount_cons, List.length_cons]
      have h1 : isoAt d r ≤ 1 := isoAt_le_one d r
      omega

/-! ## 2. Conditional two-point perturbation bounds (exact `Int`)

`e` is a per-coordinate perturbation budget; `2*e` is the caller-supplied
bound on the induced change of a pair distance. That bound is a PREMISE. -/

/-- A pair with clearance `r + 2*e ≤ d` stays non-adjacent: `r ≤ dnew`,
so the pair remains on the ISOLATED side of the tie convention. -/
theorem isolated_perturbation (d dnew r e : Int)
    (hclear : r + 2*e ≤ d) (hchange : d ≤ dnew + 2*e) :
    r ≤ dnew := by omega

/-- A pair with strict clearance `d + 2*e < r` stays adjacent: `dnew < r`,
matching the strict runtime edge predicate. -/
theorem connected_perturbation (d dnew r e : Int)
    (hclear : d + 2*e < r) (hchange : dnew ≤ d + 2*e) :
    dnew < r := by omega

/-- The two change premises together are exactly a symmetric band. -/
theorem perturbation_band (d dnew e : Int)
    (hup : dnew ≤ d + 2*e) (hdown : d ≤ dnew + 2*e) :
    -(2*e) ≤ dnew - d ∧ dnew - d ≤ 2*e :=
  ⟨by omega, by omega⟩

/-! ## 3. Exact integer clipped-window lemmas

Integer skeleton of the clipped-area diagnostic. The runtime's float area and
area/N ratio are runtime-derived and are NOT identified with these terms. -/

def clampLow (lo a : Int) : Int := if a < lo then lo else a

def clampHigh (hi b : Int) : Int := if hi < b then hi else b

theorem clampLow_ge (lo a : Int) : lo ≤ clampLow lo a := by
  simp only [clampLow]
  split <;> omega

theorem clampHigh_le (hi b : Int) : clampHigh hi b ≤ hi := by
  simp only [clampHigh]
  split <;> omega

/-- Length of `[a,b]` clipped to the window `[lo,hi]`; empty overlap is 0. -/
def clipLen (lo hi a b : Int) : Int :=
  if clampHigh hi b ≤ clampLow lo a then 0 else clampHigh hi b - clampLow lo a

theorem clipLen_nonneg (lo hi a b : Int) : 0 ≤ clipLen lo hi a b := by
  simp only [clipLen]
  split <;> omega

theorem clipLen_le_window (lo hi a b : Int) (h : lo ≤ hi) :
    clipLen lo hi a b ≤ hi - lo := by
  have h1 := clampLow_ge lo a
  have h2 := clampHigh_le hi b
  simp only [clipLen]
  split <;> omega

/-- Exact integer area of an axis-aligned rectangle clipped to a window. -/
def clipArea (lo1 hi1 a1 b1 lo2 hi2 a2 b2 : Int) : Int :=
  clipLen lo1 hi1 a1 b1 * clipLen lo2 hi2 a2 b2

theorem clipArea_nonneg (lo1 hi1 a1 b1 lo2 hi2 a2 b2 : Int) :
    0 ≤ clipArea lo1 hi1 a1 b1 lo2 hi2 a2 b2 := by
  simp only [clipArea]
  exact Int.mul_nonneg (clipLen_nonneg lo1 hi1 a1 b1) (clipLen_nonneg lo2 hi2 a2 b2)

theorem clipArea_le_window (lo1 hi1 a1 b1 lo2 hi2 a2 b2 : Int)
    (h1 : lo1 ≤ hi1) (h2 : lo2 ≤ hi2) :
    clipArea lo1 hi1 a1 b1 lo2 hi2 a2 b2 ≤ (hi1 - lo1) * (hi2 - lo2) := by
  have hx : clipLen lo1 hi1 a1 b1 ≤ hi1 - lo1 := clipLen_le_window lo1 hi1 a1 b1 h1
  have hy : clipLen lo2 hi2 a2 b2 ≤ hi2 - lo2 := clipLen_le_window lo2 hi2 a2 b2 h2
  have hy0 : 0 ≤ clipLen lo2 hi2 a2 b2 := clipLen_nonneg lo2 hi2 a2 b2
  have hb : 0 ≤ hi1 - lo1 := by omega
  simp only [clipArea]
  exact Int.mul_le_mul hx hy hy0 hb

/-! ## 4. Printed axiom obligations

The CI gate parses this output; it does not grep source comments. -/

#print axioms conn_iso_complementary
#print axioms isoAt_le_one
#print axioms isoAt_zero
#print axioms isoAt_tie
#print axioms isoAt_antitone
#print axioms isoCount_nil
#print axioms isoCount_cons
#print axioms radius_count_antitone
#print axioms isoCount_le_length
#print axioms isolated_perturbation
#print axioms connected_perturbation
#print axioms perturbation_band
#print axioms clampLow_ge
#print axioms clampHigh_le
#print axioms clipLen_nonneg
#print axioms clipLen_le_window
#print axioms clipArea_nonneg
#print axioms clipArea_le_window

end RadiusBounds
