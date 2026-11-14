/-
  FlowBounds.lean
  Exact identities behind the flow-of-work instrument (flow/1) of the
  steady-orbit orchestrator: the task lifecycle as a finite transition table,
  a potential that bounds every run, and the backlog recursion used for the
  queue readouts.

  Core Lean 4 only (pinned toolchain: leanprover/lean4:v4.33.0).
  No mathlib, no Batteries, no external import, no `sorry`,
  no placeholder / axiom-only declaration.

  Companion scope manifest: papers/data/lean/flow-scope.json
  Axiom gate:               papers/data/lean/verify_wayfinder_axioms.py
                            (reused unchanged, invoked with
                             --manifest papers/data/lean/flow-scope.json)

  ---------------------------------------------------------------------------
  CONVENTIONS

  * `St` lists the eight working states and six terminal states of a task.
  * `tableStep a b` is the transition table as written in the orchestrator
    spec (section 4). `step a b` adds the rule that any working state may be
    closed to any terminal state, and that terminal states have no successor.
  * `rank` orders the working states along the forward path; terminal states
    have rank 0. `backEdge` lists the five table edges that do not lower rank
    (re-gate after approval, re-decide after verification or continuation).
  * A budgeted run spends one unit of budget on each back edge.
    `potential b s = 9 * b + rank s`.
  * `lindley q a s = (q + a) - s` is the backlog after one time bucket with
    `a` arrivals and capacity `s` (truncated subtraction is max 0).

  ---------------------------------------------------------------------------
  WHAT IS PROVED

  (A) Lifecycle table: terminal states are absorbing; every working state has
      a table successor (no working state can only be left by an explicit
      close); every step lowers rank or is one of the five listed back edges;
      rank is at most 8.
  (B) Runs: each budgeted step strictly lowers the potential, so a run that
      starts in state s with back-edge budget b has at most 9 * b + rank s
      steps.
  (C) Occupancy: working and terminal tasks partition the task list, and
      replacing one task's state leaves the number of tasks unchanged.
  (D) Backlog: one bucket never raises the backlog when arrivals do not
      exceed capacity; it raises it by exactly the surplus otherwise; work is
      conserved; over a list of buckets the backlog stays at or below its
      start when every bucket has arrivals <= capacity, and grows by at least
      d per bucket when every bucket has arrivals >= capacity + d.

  ---------------------------------------------------------------------------
  NON-CLAIMS

  * These are textbook facts (workflow-net soundness, ranking functions,
    the Lindley recursion). Nothing here is a new theorem. The file pins the
    deployed table so a change to it must be made here too.
  * Nothing is proved about the running system: that the deployed table
    equals `tableStep`, that every task carries a finite back-edge budget,
    that scheduled sweeps fire, or that an operator ever acts. Those are
    RUNTIME obligations (the instrument's selftest checks the first).
  * Liveness under fairness is not stated: the bound limits how long a run
    can be, not that a waiting task is ever moved.
  * No queueing-theoretic, probabilistic or statistical claim follows from
    the backlog identities; arrival and capacity counts are caller inputs.
-/

namespace FlowBounds

/-! ### A. Lifecycle table -/

inductive St where
  | ingested | understood | decided | gated | awaitingApproval
  | dispatching | verifying | continued
  | succeeded | blocked | rejected | expired | failed | cancelled

def isTerminal : St → Bool
  | .succeeded | .blocked | .rejected | .expired | .failed | .cancelled => true
  | _ => false

def rank : St → Nat
  | .ingested => 8
  | .understood => 7
  | .decided => 6
  | .gated => 5
  | .awaitingApproval => 4
  | .dispatching => 3
  | .verifying => 2
  | .continued => 1
  | _ => 0

def tableStep : St → St → Bool
  | .ingested, .understood => true
  | .understood, .decided => true
  | .decided, .gated => true
  | .gated, .dispatching => true
  | .gated, .awaitingApproval => true
  | .awaitingApproval, .gated => true
  | .awaitingApproval, .decided => true
  | .dispatching, .verifying => true
  | .verifying, .continued => true
  | .verifying, .decided => true
  | .verifying, .awaitingApproval => true
  | .continued, .decided => true
  | _, _ => false

def step (a b : St) : Bool := !isTerminal a && (tableStep a b || isTerminal b)

def backEdge : St → St → Bool
  | .awaitingApproval, .gated => true
  | .awaitingApproval, .decided => true
  | .verifying, .decided => true
  | .verifying, .awaitingApproval => true
  | .continued, .decided => true
  | _, _ => false

/-- Terminal states are absorbing: no step leaves one. -/
theorem terminal_absorbing (a b : St) : isTerminal a = true → step a b = false := by
  cases a <;> cases b <;> decide

/-- Every working state has a successor in the table itself, so none can only
    be left by an explicit close. -/
theorem no_dead_state (a : St) : isTerminal a = false → ∃ b, tableStep a b = true := by
  intro h
  cases a
  · exact ⟨.understood, rfl⟩
  · exact ⟨.decided, rfl⟩
  · exact ⟨.gated, rfl⟩
  · exact ⟨.dispatching, rfl⟩
  · exact ⟨.gated, rfl⟩
  · exact ⟨.verifying, rfl⟩
  · exact ⟨.continued, rfl⟩
  · exact ⟨.decided, rfl⟩
  all_goals exact absurd h (by decide)

/-- Rank never exceeds 8. -/
theorem rank_le (s : St) : rank s ≤ 8 := by
  cases s <;> decide

/-- Every step lowers rank, or is one of the five listed back edges. -/
theorem rank_or_back_edge (a b : St) :
    step a b = true → rank b < rank a ∨ backEdge a b = true := by
  cases a <;> cases b <;> decide

/-- Back edges are table edges between working states. -/
theorem back_edge_is_table_edge (a b : St) : backEdge a b = true → tableStep a b = true := by
  cases a <;> cases b <;> decide

/-! ### B. Budgeted runs -/

def potential (b : Nat) (s : St) : Nat := 9 * b + rank s

/-- One step from state `a` with budget `b` to state `c` with budget `b'`:
    a back edge spends one unit of budget, any other step spends none. -/
def stepB (b : Nat) (a : St) (b' : Nat) (c : St) : Prop :=
  step a c = true ∧ ((backEdge a c = true ∧ b' + 1 = b) ∨ (backEdge a c = false ∧ b' = b))

/-- Each budgeted step strictly lowers the potential. -/
theorem potential_decreases {b b' : Nat} {a c : St} :
    stepB b a b' c → potential b' c < potential b a := by
  intro h
  have hc := rank_le c
  unfold potential
  cases h.2 with
  | inl hb => omega
  | inr hf =>
    cases rank_or_back_edge a c h.1 with
    | inl hr => omega
    | inr hbk => rw [hf.1] at hbk; exact absurd hbk (by decide)

/-- `Run b s n`: there is a run of `n` budgeted steps from state `s` with
    back-edge budget `b`. -/
inductive Run : Nat → St → Nat → Prop where
  | nil (b : Nat) (s : St) : Run b s 0
  | cons {b b' : Nat} {a c : St} {n : Nat} : stepB b a b' c → Run b' c n → Run b a (n + 1)

/-- A run from state `s` with back-edge budget `b` has at most
    `9 * b + rank s` steps. -/
theorem run_length_le {b : Nat} {s : St} {n : Nat} : Run b s n → n ≤ potential b s := by
  intro h
  induction h with
  | nil b s => exact Nat.zero_le _
  | cons hs _ ih =>
    have hd := potential_decreases hs
    omega

/-- With no back-edge budget a run from intake has at most 8 steps. -/
theorem run_length_no_budget {s : St} {n : Nat} : Run 0 s n → n ≤ 8 := by
  intro h
  have h1 := run_length_le h
  have h2 := rank_le s
  unfold potential at h1
  omega

/-! ### C. Occupancy -/

def working (l : List St) : Nat := (l.filter (fun s => !isTerminal s)).length
def finished (l : List St) : Nat := (l.filter isTerminal).length

/-- Working and terminal tasks partition the task list. -/
theorem occupancy_conserved (l : List St) : working l + finished l = l.length := by
  unfold working finished
  induction l with
  | nil => rfl
  | cons x xs ih =>
    cases hx : isTerminal x <;> simp [List.filter, hx] <;> omega

/-- Moving one task to another state leaves the number of tasks unchanged. -/
theorem move_preserves_total (l : List St) (i : Nat) (s : St) :
    (l.set i s).length = l.length := by
  simp

/-- After any move, working and terminal tasks still account for every task. -/
theorem occupancy_conserved_under_move (l : List St) (i : Nat) (s : St) :
    working (l.set i s) + finished (l.set i s) = l.length := by
  rw [occupancy_conserved, move_preserves_total]

/-! ### D. Backlog recursion -/

def lindley (q a s : Nat) : Nat := (q + a) - s

/-- When arrivals do not exceed capacity the backlog does not grow. -/
theorem lindley_le_of_arrivals_le {q a s : Nat} (h : a ≤ s) : lindley q a s ≤ q := by
  unfold lindley
  omega

/-- When arrivals reach capacity the backlog grows by exactly the surplus. -/
theorem lindley_surplus {q a s : Nat} (h : s ≤ a) : lindley q a s = q + (a - s) := by
  unfold lindley
  omega

/-- The recursion is monotone in the starting backlog. -/
theorem lindley_mono {q q' a s : Nat} (h : q ≤ q') : lindley q a s ≤ lindley q' a s := by
  unfold lindley
  omega

/-- Work conservation: backlog carried over plus work served equals work present. -/
theorem lindley_conservation (q a s : Nat) : lindley q a s + min (q + a) s = q + a := by
  unfold lindley
  omega

/-- Backlog after a list of (arrivals, capacity) buckets. -/
def backlog (q : Nat) : List (Nat × Nat) → Nat
  | [] => q
  | (a, s) :: t => backlog (lindley q a s) t

/-- If every bucket has arrivals at most capacity, the backlog never ends
    above where it started. -/
theorem backlog_le_start (l : List (Nat × Nat)) :
    ∀ q : Nat, (∀ p, p ∈ l → p.1 ≤ p.2) → backlog q l ≤ q := by
  induction l with
  | nil => intro q _; exact Nat.le_refl q
  | cons p t ih =>
    intro q h
    obtain ⟨a, s⟩ := p
    have h1 : a ≤ s := h (a, s) (by simp)
    have h2 := ih (lindley q a s) (fun p hp => h p (by simp [hp]))
    have h3 := lindley_le_of_arrivals_le (q := q) h1
    show backlog (lindley q a s) t ≤ q
    omega

/-- If every bucket has arrivals at least capacity plus d, the backlog grows
    by at least d per bucket. -/
theorem backlog_growth (d : Nat) (l : List (Nat × Nat)) :
    ∀ q : Nat, (∀ p, p ∈ l → p.2 + d ≤ p.1) → q + d * l.length ≤ backlog q l := by
  induction l with
  | nil => intro q _; simp [backlog]
  | cons p t ih =>
    intro q h
    obtain ⟨a, s⟩ := p
    have h1 : s + d ≤ a := h (a, s) (by simp)
    have h2 := ih (lindley q a s) (fun p hp => h p (by simp [hp]))
    have h3 : lindley q a s = q + (a - s) := lindley_surplus (by omega)
    show q + d * (t.length + 1) ≤ backlog (lindley q a s) t
    rw [Nat.mul_succ]
    omega

#print axioms terminal_absorbing
#print axioms no_dead_state
#print axioms rank_le
#print axioms rank_or_back_edge
#print axioms back_edge_is_table_edge
#print axioms potential_decreases
#print axioms run_length_le
#print axioms run_length_no_budget
#print axioms occupancy_conserved
#print axioms move_preserves_total
#print axioms occupancy_conserved_under_move
#print axioms lindley_le_of_arrivals_le
#print axioms lindley_surplus
#print axioms lindley_mono
#print axioms lindley_conservation
#print axioms backlog_le_start
#print axioms backlog_growth

end FlowBounds
