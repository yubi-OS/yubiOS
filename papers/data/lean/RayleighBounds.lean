/-
  RayleighBounds.lean — rayleigh/1 (2026-09-18), core Lean 4.33.0, no Mathlib, no sorry.

  Exact integer statements behind the wayfinder's Rayleigh diagnostics on the
  isolation graph (points adjacent when chord < 0.095). A graph is an edge list
  on Nat vertices; a vector is a function Nat → Int.

    quad edges x  =  Σ_{(i,j) ∈ edges} (x i − x j)²        (the Laplacian quadratic form xᵀLx)

  Proved here:
    quad_nonneg          xᵀLx ≥ 0                                   (L is PSD, exact)
    quad_const           constant vectors are in the kernel
    quad_shift           adding a constant leaves xᵀLx unchanged
    quad_scale           scaling x by c multiplies xᵀLx by c²
    quad_indicator       for a 0/1 indicator 1_S, xᵀLx = cut(S)     (edges with exactly one end in S)
    quad_no_incident     a vertex touched by no edge has 1_{v}ᵀ L 1_{v} = 0  (isolated ⇒ kernel)
    witness_numerator    x = n·1_S − k·1  ⇒  xᵀLx = n²·cut(S)
    witness_denominator  k(n−k)² + (n−k)k² = n·k·(n−k)             (the ‖x‖² of that x, algebraically)
    rr_path_example      concrete instance on the 8-vertex path: witness quotient 1/2 (decide)

  Scope (see rayleigh-scope.json): these are integer identities about finite edge
  lists. They do NOT prove that nullity(L) equals the number of components (that
  needs linear algebra), do NOT certify the float Fiedler estimate, and say nothing
  about semantic quality. The runtime asserts λ₂ ≤ witness quotient as a check on
  its own float, using the exact rational witness these identities justify.
-/

namespace Rayleigh

def quad : List (Nat × Nat) → (Nat → Int) → Int
  | [], _ => 0
  | e :: es, x => (x e.1 - x e.2) * (x e.1 - x e.2) + quad es x

theorem quad_nil (x : Nat → Int) : quad [] x = 0 := rfl

theorem quad_cons (e : Nat × Nat) (es : List (Nat × Nat)) (x : Nat → Int) :
    quad (e :: es) x = (x e.1 - x e.2) * (x e.1 - x e.2) + quad es x := rfl

theorem quad_nonneg : ∀ (es : List (Nat × Nat)) (x : Nat → Int), 0 ≤ quad es x
  | [], _ => Int.le_refl 0
  | e :: es, x => by
      rw [quad_cons]
      exact Int.add_nonneg (Int.mul_self_nonneg _) (quad_nonneg es x)

theorem quad_const : ∀ (es : List (Nat × Nat)) (c : Int), quad es (fun _ => c) = 0
  | [], _ => rfl
  | e :: es, c => by
      rw [quad_cons, quad_const es c]
      simp

theorem quad_shift : ∀ (es : List (Nat × Nat)) (x : Nat → Int) (b : Int),
    quad es (fun v => x v + b) = quad es x
  | [], _, _ => rfl
  | e :: es, x, b => by
      rw [quad_cons, quad_cons, quad_shift es x b]
      have h : x e.1 + b - (x e.2 + b) = x e.1 - x e.2 := by omega
      rw [h]

theorem quad_scale : ∀ (es : List (Nat × Nat)) (x : Nat → Int) (c : Int),
    quad es (fun v => c * x v) = c * c * quad es x
  | [], _, _ => by simp [quad]
  | e :: es, x, c => by
      rw [quad_cons, quad_cons, quad_scale es x c]
      have h : c * x e.1 - c * x e.2 = c * (x e.1 - x e.2) := by
        rw [Int.mul_sub]
      rw [h, Int.mul_add]
      -- c*(a) * (c*(a)) = c*c*(a*a)
      have h2 : c * (x e.1 - x e.2) * (c * (x e.1 - x e.2))
              = c * c * ((x e.1 - x e.2) * (x e.1 - x e.2)) := by
        rw [Int.mul_assoc, Int.mul_comm (x e.1 - x e.2) (c * (x e.1 - x e.2)), Int.mul_assoc,
            ← Int.mul_assoc c c]
      rw [h2]

/-- 0/1 indicator of a vertex list. -/
def ind (S : List Nat) (v : Nat) : Int := if S.elem v then 1 else 0

/-- number of edges with exactly one endpoint in S. -/
def cut : List (Nat × Nat) → List Nat → Nat
  | [], _ => 0
  | e :: es, S => (if S.elem e.1 = S.elem e.2 then 0 else 1) + cut es S

theorem ind_sq_diff (S : List Nat) (a b : Nat) :
    (ind S a - ind S b) * (ind S a - ind S b) = (if S.elem a = S.elem b then 0 else 1 : Int) := by
  unfold ind
  cases S.elem a <;> cases S.elem b <;> simp

theorem quad_indicator : ∀ (es : List (Nat × Nat)) (S : List Nat),
    quad es (ind S) = (cut es S : Int)
  | [], _ => rfl
  | e :: es, S => by
      rw [quad_cons, ind_sq_diff, quad_indicator es S]
      unfold cut
      cases h : (S.elem e.1 = S.elem e.2) <;> simp_all [Nat.cast_add]

/-- an edge list where no edge touches v -/
def untouched (es : List (Nat × Nat)) (v : Nat) : Prop := ∀ e ∈ es, e.1 ≠ v ∧ e.2 ≠ v

theorem cut_singleton_untouched : ∀ (es : List (Nat × Nat)) (v : Nat), untouched es v → cut es [v] = 0
  | [], _, _ => rfl
  | e :: es, v, h => by
      have he := h e (List.mem_cons_self e es)
      have hrest : untouched es v := fun e' he' => h e' (List.mem_cons_of_mem e he')
      unfold cut
      rw [cut_singleton_untouched es v hrest]
      have h1 : [v].elem e.1 = false := by simp [List.elem, he.1]
      have h2 : [v].elem e.2 = false := by simp [List.elem, he.2]
      simp [h1, h2]

/-- isolated vertex ⇒ its indicator is in the kernel of the quadratic form -/
theorem quad_no_incident (es : List (Nat × Nat)) (v : Nat) (h : untouched es v) :
    quad es (ind [v]) = 0 := by
  rw [quad_indicator, cut_singleton_untouched es v h]
  rfl

/-- Rayleigh–Ritz witness numerator: x = n·1_S − k·1 has xᵀLx = n²·cut(S). -/
theorem witness_numerator (es : List (Nat × Nat)) (S : List Nat) (n k : Int) :
    quad es (fun v => n * ind S v - k) = n * n * (cut es S : Int) := by
  have h1 : (fun v => n * ind S v - k) = (fun v => (n * ind S v) + (-k)) := by
    funext v; omega
  rw [h1, quad_shift, quad_scale, quad_indicator]

/-- Rayleigh–Ritz witness denominator, algebraically: k(n−k)² + (n−k)k² = n·k·(n−k). -/
theorem witness_denominator (n k : Int) :
    k * (n - k) * (n - k) + (n - k) * k * k = n * k * (n - k) := by
  have h1 : k * (n - k) * (n - k) = (n - k) * k * (n - k) := by
    rw [Int.mul_comm k (n - k)]
  rw [h1, ← Int.mul_add, Int.sub_add_cancel]
  rw [Int.mul_comm ((n - k) * k) n, Int.mul_assoc n k (n - k), Int.mul_comm (n - k) k]

/-- concrete instance: 8-vertex path 0-1-…-7, S = {0,1,2,3}: cut = 1, witness R = 8·1/(4·4) = 1/2 -/
def path8 : List (Nat × Nat) := [(0,1),(1,2),(2,3),(3,4),(4,5),(5,6),(6,7)]

theorem rr_path_example : cut path8 [0,1,2,3] = 1 ∧ (8 : Nat) * cut path8 [0,1,2,3] * 2 = 4 * (8 - 4) := by
  decide

theorem rr_path_quad : quad path8 (ind [0,1,2,3]) = 1 := by
  decide

end Rayleigh
