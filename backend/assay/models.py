"""Run record and API shapes. PRD §8 is the source. Mirror every change in web/src/types.ts."""

from typing import Literal

from pydantic import BaseModel, Field

TaskType = Literal["fact", "briefing", "unanswerable"]
Trap = Literal["fake_article", "hidden_instruction", "search_outage", "model_outage"]


class RunConfig(BaseModel):
    agent_version: str
    models: list[str]
    prompt_hash: str
    pool_version: str
    trap_seed: int | None
    fallback_used: bool


class RunOutput(BaseModel):
    text: str
    abstained: bool


class Step(BaseModel):
    i: int
    t: float
    kind: Literal["search", "read", "llm", "switch", "error"]
    detail: str
    model: str | None
    phase: Literal["plan", "search", "write", "check"]
    tokens: int
    cost_usd: float


class Claim(BaseModel):
    text: str
    verdict: Literal["supported", "unsupported", "trap", "not_found"]
    source_url: str | None
    source_quote: str | None


class RunMetrics(BaseModel):
    success: bool
    steps: int
    tool_calls: int
    tokens: int
    cost_usd: float
    cost_by_model: dict[str, float]
    switched: bool
    trap_fell: bool
    abstention: Literal["correct", "wrong_answer", "over_refusal"] | None
    claims_supported_pct: float | None


class RunRecord(BaseModel):
    id: str
    batch_id: str
    agent_id: str
    task_id: str
    task_type: TaskType
    trap: Trap | None
    repeat: int
    status: Literal["running", "done", "error", "budget_exceeded"]
    started_at: str
    duration_s: float | None
    config: RunConfig
    output: RunOutput
    steps: list[Step]
    claims: list[Claim]
    metrics: RunMetrics


class Task(BaseModel):
    id: str
    type: TaskType
    prompt: str
    as_of_date: str
    answer: str | None  # fact only; "NOT_FOUND" for unanswerable
    trap_twin: str | None
    notes: str


class Agent(BaseModel):
    id: str
    name: str
    kind: Literal["ours", "outside"]
    description: str


class LeaderboardRow(BaseModel):
    agent_id: str
    accuracy: float
    cost_per_correct: float
    trap_resistance: float
    honesty: float
    pass3: float
    avg_steps: float
    avg_tokens: float
    avg_duration_s: float
    runs: int


class Compare(BaseModel):
    scope: Literal["batch", "full"]
    a: LeaderboardRow
    b: LeaderboardRow


class BatchRequest(BaseModel):
    """POST /api/batches. Repeats are fixed at 3 (PRD §13), so there is no repeats field."""
    agents: list[str] = Field(min_length=1, max_length=3)
    task_id: str
    trap: Trap | None
    passcode: str


class BatchCreated(BaseModel):
    """POST /api/batches reply. 409 when another batch is running, 403 on a wrong passcode."""
    batch_id: str


class BatchStatus(BaseModel):
    """GET /api/batches/{id}. Per-run state comes from GET /api/runs?batch_id=."""
    batch_id: str
    status: Literal["running", "done"]
    agents: list[str]
    task_id: str
    trap: Trap | None
    repeats: int
    started_at: str


# SSE on GET /api/batches/{id}/stream: each message is `event: <name>` + `data: <JSON payload below>`.
BatchEventName = Literal["run_started", "step", "run_done", "batch_done"]


class RunStartedEvent(BaseModel):
    run_id: str
    batch_id: str
    agent_id: str
    repeat: int
    started_at: str


class StepEvent(BaseModel):
    run_id: str
    step: Step


class RunDoneEvent(BaseModel):
    run_id: str
    status: Literal["done", "error", "budget_exceeded"]
    duration_s: float
    metrics: RunMetrics


class BatchDoneEvent(BaseModel):
    batch_id: str


EVENT_DATA: dict[str, type[BaseModel]] = {
    "run_started": RunStartedEvent, "step": StepEvent, "run_done": RunDoneEvent, "batch_done": BatchDoneEvent,
}
