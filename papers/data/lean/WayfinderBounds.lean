/-
  WayfinderBounds.lean
  Exact integer obligations behind the point-map wayfinder diagnostics.

  Core Lean 4 only (pinned toolchain: leanprover/lean4:v4.33.0).
  No mathlib, no Batteries, no external dependency, no `sorry`,
  no placeholder / axiom-only declarations.

  Companion scope manifest: papers/data/lean/wayfinder-scope.json
  Axiom gate:               papers/data/lean/verify_wayfinder_axioms.py

  ---------------------------------------------------------------------------
  WHAT IS PROVED

  (A) Threshold stability over signed INTEGER margins. A runtime bit is on iff
      its integer score is strictly positive. Given an integer perturbation
      `delta` bounded by an integer `radius`, the bit's state is stable.
      Equality is deliberately asymmetric: the off-side statement allows
      `margin + delta = 0` because the runtime predicate is `score > 0`.

  (B) A finite, exact ledger for the isolated-vertex count of a simple graph
      under two edit shapes, ADD (one new vertex) and CHANGE (one existing
      vertex's incident edges retoggled). Both are counted in Int / Nat only.

  ---------------------------------------------------------------------------
  FROZEN-GRAPH ASSUMPTION (explicit, load-bearing, NOT proved here)

  Every graph theorem below is stated over a `rows` list that is *assumed* to
  enumerate each old vertex exactly once. All edges that are not incident to
  the single edited vertex are assumed FROZEN: unchanged in both endpoints and
  presence across the edit. Degrees are plain `Nat`; margins and counts are
  plain `Int`. Nothing here proves that the runtime actually builds such a
  list, nor that the runtime graph is simple, nor that its degrees match these
  `Nat`s. That correspondence is a runtime obligation, recorded per theorem in
  wayfinder-scope.json and checked by runtime tests, not by this kernel run.

  ---------------------------------------------------------------------------
  NON-CLAIMS

  These are exact arithmetic identities over integers. They are NOT fluid
  equations, NOT floating-point error bounds, NOT probabilistic certificates,
  NOT statements about prediction accuracy, ranking quality, or semantic task
  grading. A checked theorem here certifies only that the corresponding
  integer identity carries no empirical content.
-/
namespace WayfinderBounds

/-! ## 1. Signed integer threshold margins

`margin` is the runtime score minus the threshold, as an exact integer.
`radius` is an integer lower bound on the perturbation's magnitude budget. -/

/-- A strictly-positive-margin bit stays on under any perturbation bounded
below by `-radius`, provided the margin strictly exceeds the radius. -/
theorem stable_on (margin delta radius : Int)
    (hm : radius < margin) (hd : -radius ≤ delta) :
    0 < margin + delta := by omega

/-- An off bit stays off. Equality is permitted: the runtime test is `> 0`. -/
theorem stable_off (margin delta radius : Int)
    (hm : margin ≤ -radius) (hd : delta ≤ radius) :
    margin + delta ≤ 0 := by omega

/-- Exact crossing characterisation for the on-side. -/
theorem crossing_on_iff (margin delta : Int) :
    0 < margin + delta ↔ -margin < delta := by omega

/-- Exact crossing characterisation for the off-side. -/
theorem crossing_off_iff (margin delta : Int) :
    margin + delta ≤ 0 ↔ delta ≤ -margin := by omega

/-! ## 2. Isolation indicators (exact integer counts) -/

/-- Isolation indicator of a vertex of degree `degree`: 1 when isolated. -/
def iso (degree : Nat) : Int := if degree = 0 then 1 else 0

/-- An edge's contribution to a `Nat` degree. -/
def edgeNat (edge : Bool) : Nat := if edge then 1 else 0

/-! ## 3. ADD: one new vertex, all old edges frozen

`rows` enumerates the old vertices: `(degree, edge)` is an old vertex's
pre-edit degree together with whether the single new vertex attaches to it. -/

/-- An old isolated vertex is "hit" exactly when the new vertex attaches. -/
def hit (degree : Nat) (edge : Bool) : Int :=
  if degree = 0 then (if edge then 1 else 0) else 0

/-- Per-old-vertex ADD identity. -/
theorem old_vertex_after_add (degree : Nat) (edge : Bool) :
    iso (degree + edgeNat edge) = iso degree - hit degree edge := by
  cases edge <;> cases degree <;> simp [iso, edgeNat, hit]

def oldIso : List (Nat × Bool) → Int
  | [] => 0
  | (degree, _) :: tail => iso degree + oldIso tail

def afterOldIso : List (Nat × Bool) → Int
  | [] => 0
  | (degree, edge) :: tail => iso (degree + edgeNat edge) + afterOldIso tail

def hitIso : List (Nat × Bool) → Int
  | [] => 0
  | (degree, edge) :: tail => hit degree edge + hitIso tail

/-- Degree of the new vertex, as counted by the same rows. -/
def newDegree : List (Nat × Bool) → Nat
  | [] => 0
  | (_, edge) :: tail => edgeNat edge + newDegree tail

/-- Summed ADD identity over all old vertices. -/
theorem after_old_count (rows : List (Nat × Bool)) :
    afterOldIso rows = oldIso rows - hitIso rows := by
  induction rows with
  | nil => rfl
  | cons row tail ih =>
      cases row with
      | mk degree edge =>
          simp only [afterOldIso, oldIso, hitIso]
          rw [old_vertex_after_add]
          omega

/-- Exact finite ADD ledger: the change in isolated-vertex count equals the
new vertex's own isolation indicator minus the old isolated vertices it hit. -/
theorem add_isolation_delta (rows : List (Nat × Bool)) :
    (afterOldIso rows + iso (newDegree rows)) - oldIso rows =
      iso (newDegree rows) - hitIso rows := by
  have h := after_old_count rows
  omega

/-! ## 4. CHANGE: one existing vertex, its incident edges retoggled

`rows` enumerates the OTHER old vertices. For each, `rest` is its degree
counting only edges NOT incident to the changed vertex (frozen by assumption),
`before` / `after` are its edge to the changed vertex pre- and post-edit. -/

/-- Per-neighbour isolation change induced by a CHANGE. -/
def chgHit (rest : Nat) (before after : Bool) : Int :=
  iso (rest + edgeNat after) - iso (rest + edgeNat before)

/-- Closed form of the per-neighbour CHANGE term: only vertices whose frozen
degree is zero can change isolation state, and then only by the edge toggle. -/
theorem chg_hit_eval (rest : Nat) (before after : Bool) :
    chgHit rest before after =
      (if rest = 0 then (if before then 1 else 0) - (if after then 1 else 0)
       else 0) := by
  cases before <;> cases after <;> cases rest <;> simp [chgHit, iso, edgeNat]

def oldIsoC : List (Nat × Bool × Bool) → Int
  | [] => 0
  | (rest, before, _) :: tail => iso (rest + edgeNat before) + oldIsoC tail

def afterIsoC : List (Nat × Bool × Bool) → Int
  | [] => 0
  | (rest, _, after) :: tail => iso (rest + edgeNat after) + afterIsoC tail

def chgLedger : List (Nat × Bool × Bool) → Int
  | [] => 0
  | (rest, before, after) :: tail => chgHit rest before after + chgLedger tail

/-- Degree of the changed vertex before the edit, counted by the same rows. -/
def degBeforeOf : List (Nat × Bool × Bool) → Nat
  | [] => 0
  | (_, before, _) :: tail => edgeNat before + degBeforeOf tail

/-- Degree of the changed vertex after the edit, counted by the same rows. -/
def degAfterOf : List (Nat × Bool × Bool) → Nat
  | [] => 0
  | (_, _, after) :: tail => edgeNat after + degAfterOf tail

/-- Summed CHANGE identity over the unchanged (neighbour) vertices. -/
theorem change_neighbour_ledger (rows : List (Nat × Bool × Bool)) :
    afterIsoC rows - oldIsoC rows = chgLedger rows := by
  induction rows with
  | nil => rfl
  | cons row tail ih =>
      cases row with
      | mk rest pair =>
          cases pair with
          | mk before after =>
              simp only [afterIsoC, oldIsoC, chgLedger, chgHit]
              omega

/-- Exact finite CHANGE ledger, with the changed vertex's own degree taken
from the same rows (no free parameter): the change in isolated-vertex count
decomposes into the neighbour ledger plus the changed vertex's own term. -/
theorem change_isolation_delta (rows : List (Nat × Bool × Bool)) :
    (afterIsoC rows + iso (degAfterOf rows))
        - (oldIsoC rows + iso (degBeforeOf rows)) =
      chgLedger rows + (iso (degAfterOf rows) - iso (degBeforeOf rows)) := by
  have h := change_neighbour_ledger rows
  omega

/-- A CHANGE that toggles no incident edge moves no isolation count. -/
theorem change_neutral (rows : List (Nat × Bool × Bool))
    (h : ∀ r ∈ rows, r.2.1 = r.2.2) :
    chgLedger rows = 0 := by
  induction rows with
  | nil => rfl
  | cons row tail ih =>
      cases row with
      | mk rest pair =>
          cases pair with
          | mk before after =>
              have hhead : before = after := h (rest, before, after) (by simp)
              have htail : ∀ r ∈ tail, r.2.1 = r.2.2 := fun r hr =>
                h r (by simp [hr])
              simp only [chgLedger, chgHit, hhead, ih htail]
              omega

/-! ## 5. Printed axiom obligations

The CI gate parses this output; it does not grep source comments. -/

#print axioms stable_on
#print axioms stable_off
#print axioms crossing_on_iff
#print axioms crossing_off_iff
#print axioms old_vertex_after_add
#print axioms after_old_count
#print axioms add_isolation_delta
#print axioms chg_hit_eval
#print axioms change_neighbour_ledger
#print axioms change_isolation_delta
#print axioms change_neutral

end WayfinderBounds
