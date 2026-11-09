"""Run record and API shapes. PRD §8 is the source. Mirror every change in web/src/types.ts."""

from typing import Literal

from pydantic import BaseModel

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
