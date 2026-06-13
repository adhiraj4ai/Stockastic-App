# Plan Generate Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a POST `/api/stocks/plan/generate/` endpoint and a "Generate plan" button on the `/plan` page so any logged-in user can trigger plan generation on demand.

**Architecture:** A new `PlanGenerateView` calls `build_daily_plan()` synchronously and returns the same response shape as `PlanTodayView` (plan + user overlay + sizing). The frontend adds a `generating` boolean state and a button in the existing controls bar; on success it replaces the plan state directly from the response.

**Tech Stack:** Django REST Framework (backend), Next.js / React (frontend), lucide-react, sonner toasts.

---

### Task 1: Backend — `PlanGenerateView` + URL

**Files:**
- Modify: `backend/stocks/views/plan.py`
- Modify: `backend/stocks/urls.py`

- [ ] **Step 1: Add `PlanGenerateView` to `plan.py`**

Open `backend/stocks/views/plan.py`. After the `PlanHistoryView` class, append:

```python
class PlanGenerateView(APIView):
    """Manually trigger plan generation and return the result."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from ..services.daily_plan import build_daily_plan
        try:
            plan = build_daily_plan()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        data = _serialize(plan)
        data["overlay"] = user_overlay(request.user)
        data["overlay"]["sizing"] = sizing_map_for_user(
            request.user, plan.payload.get("picks", []))
        return Response(data)
```

- [ ] **Step 2: Register the URL**

Open `backend/stocks/urls.py`. Find the plan routes block (around line 102):

```python
    # Daily trading plan
    path('plan/today/', plan.PlanTodayView.as_view(), name='plan_today'),
    path('plan/', plan.PlanHistoryView.as_view(), name='plan_history'),
```

Add the generate route between them:

```python
    # Daily trading plan
    path('plan/today/', plan.PlanTodayView.as_view(), name='plan_today'),
    path('plan/generate/', plan.PlanGenerateView.as_view(), name='plan_generate'),
    path('plan/', plan.PlanHistoryView.as_view(), name='plan_history'),
```

(Must come before `plan/` or Django's prefix matching would swallow it.)

---

### Task 2: Backend — test

**Files:**
- Modify: `backend/tests/test_daily_plan.py`

- [ ] **Step 1: Write the failing test**

Open `backend/tests/test_daily_plan.py`. At the bottom of the file add:

```python
@pytest.mark.django_db
class TestPlanGenerateView:
    def test_post_returns_plan(self, auth_client):
        plan_obj = DailyTradingPlan.objects.create(
            date=date(2026, 6, 13),
            regime="RISK_ON",
            breadth=0.6,
            payload={"picks": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        with patch("stocks.views.plan.build_daily_plan", return_value=plan_obj) as mock_build, \
             patch("stocks.views.plan.user_overlay", return_value={}), \
             patch("stocks.views.plan.sizing_map_for_user", return_value={}):
            resp = auth_client.post("/api/stocks/plan/generate/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-13"
        assert "picks" in data["payload"]
        assert "overlay" in data
        mock_build.assert_called_once()

    def test_post_unauthenticated_returns_401(self, api_client):
        resp = api_client.post("/api/stocks/plan/generate/")
        assert resp.status_code == 401

    def test_post_build_failure_returns_400(self, auth_client):
        with patch("stocks.views.plan.build_daily_plan", side_effect=RuntimeError("no data")):
            resp = auth_client.post("/api/stocks/plan/generate/")
        assert resp.status_code == 400
        assert "no data" in resp.json()["detail"]
```

The imports `patch` and `DailyTradingPlan` are already at the top of the file. The `auth_client` and `api_client` fixtures come from `backend/tests/conftest.py`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
python3 -m pytest tests/test_daily_plan.py::TestPlanGenerateView -v
```

Expected: 3 failures — `PlanGenerateView` does not exist yet (or URL not found → 404).

- [ ] **Step 3: Run tests to verify they pass after Task 1**

```bash
cd backend
python3 -m pytest tests/test_daily_plan.py::TestPlanGenerateView -v
```

Expected output:
```
PASSED tests/test_daily_plan.py::TestPlanGenerateView::test_post_returns_plan
PASSED tests/test_daily_plan.py::TestPlanGenerateView::test_post_unauthenticated_returns_401
PASSED tests/test_daily_plan.py::TestPlanGenerateView::test_post_build_failure_returns_400
3 passed
```

- [ ] **Step 4: Run the full plan test suite to check no regressions**

```bash
cd backend
python3 -m pytest tests/test_daily_plan.py -v
```

Expected: all previously-passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/views/plan.py backend/stocks/urls.py backend/tests/test_daily_plan.py
git commit -m "feat(plan): POST /plan/generate/ endpoint"
```

---

### Task 3: Frontend — Generate button

**Files:**
- Modify: `frontend/src/app/(authenticated)/plan/page.tsx`

- [ ] **Step 1: Add `generating` state and `handleGenerate` function**

Open `frontend/src/app/(authenticated)/plan/page.tsx`.

After the existing `const [drafting, setDrafting] = useState(false);` line (around line 139), add:

```tsx
const [generating, setGenerating] = useState(false);
```

After the `handleHistoryDateChange` function (around line 174), add:

```tsx
const handleGenerate = async () => {
    setGenerating(true);
    try {
        const res = await api.post('/api/stocks/plan/generate/');
        setPlan(res.data);
        setHistoryDate('');
        setHistoryPlan(null);
        setSelectedPick(null);
        toast.success('Plan generated.');
    } catch (err: any) {
        const detail = err?.response?.data?.detail ?? 'Could not generate the plan.';
        toast.error(detail);
    } finally {
        setGenerating(false);
    }
};
```

- [ ] **Step 2: Add `RefreshCw` to the lucide-react import**

Find the existing lucide-react import at the top of the file:

```tsx
import {
    ShieldAlert, Eye, CalendarClock, TrendingDown, TrendingUp, Activity,
    Layers, ChevronUp, ChevronDown, ChevronRight, X, ExternalLink,
    CalendarDays, Zap, Wallet,
} from 'lucide-react';
```

Add `RefreshCw` to the list:

```tsx
import {
    ShieldAlert, Eye, CalendarClock, TrendingDown, TrendingUp, Activity,
    Layers, ChevronUp, ChevronDown, ChevronRight, X, ExternalLink,
    CalendarDays, Zap, Wallet, RefreshCw,
} from 'lucide-react';
```

- [ ] **Step 3: Add the button to the controls bar**

Find the right side of the controls bar — the `flex items-center gap-2 ml-auto flex-wrap` div (around line 266). It ends just before the closing `</div>` of the controls bar. Add the Generate button as the last item inside that div, after the "Generated at" chip:

```tsx
<Button
    variant="outline"
    size="sm"
    disabled={generating}
    onClick={handleGenerate}
    className="h-8 px-3 text-[11px] font-semibold rounded-xl border-slate-200 dark:border-border gap-1.5 shrink-0"
>
    <RefreshCw className={cn('w-3.5 h-3.5', generating && 'animate-spin')} />
    {generating ? 'Generating…' : 'Generate plan'}
</Button>
```

The exact insertion point — place it after this block:

```tsx
<span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700">
    Generated {format(parseISO(displayed.generated_at), 'MMM dd, HH:mm')}
</span>
```

- [ ] **Step 4: Also add the button to the empty/error state**

The error state (when `error || !displayed`, around line 219) currently just shows a message. Replace the inner content so users can generate from the empty state too:

Find:
```tsx
    if (error || !displayed) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
                    {error ?? 'Could not load the plan.'}
                </div>
            </DashboardLayout>
        );
    }
```

Replace with:
```tsx
    if (error || !displayed) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                        {error ?? 'Could not load the plan.'}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={generating}
                        onClick={handleGenerate}
                        className="h-8 px-3 text-[11px] font-semibold rounded-xl gap-1.5"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', generating && 'animate-spin')} />
                        {generating ? 'Generating…' : 'Generate plan'}
                    </Button>
                </div>
            </DashboardLayout>
        );
    }
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/(authenticated)/plan/page.tsx
git commit -m "feat(plan): generate button in controls bar and empty state"
```
