# backend/llm.py
import os
import json
from groq import Groq
from prompts import (
    INTERVIEWER_SYSTEM_PROMPT, CANDIDATE_SYSTEM_PROMPT,
    FEEDBACK_SYSTEM_PROMPT, SOLVE_AND_RATE_PROMPT,
    SIMULATE_VP_PROMPT, SAMPLE_TEST_FEEDBACK_PROMPT,
    SAMPLE_TEST_QUESTION, PRACTICE_OPTIONS, ROLE_CONTEXT,
    build_rubric_score_fields, format_sample_cases, format_history
)

MODEL = "llama-3.1-8b-instant"
_client = None


def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not set")
        _client = Groq(api_key=api_key)
    return _client


def _call(prompt: str, max_tokens: int = 500, temperature: float = 0.7) -> str:
    response = get_client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=temperature
    )
    return response.choices[0].message.content.strip()


def _parse_json(raw: str) -> dict:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def get_interviewer_response(history: list, company_name: str, case_context: str,
                              sample_cases: list, practice_mode: str = "untimed",
                              role: str = "analyst") -> str:
    role_data = ROLE_CONTEXT.get(role, ROLE_CONTEXT["analyst"])
    prompt = INTERVIEWER_SYSTEM_PROMPT.format(
        company_name=company_name,
        role_label=role_data["label"],
        role_expectation=role_data["expectation"],
        practice_mode=practice_mode,
        mode_instruction=PRACTICE_OPTIONS.get(practice_mode, PRACTICE_OPTIONS["untimed"]),
        case_context=case_context,
        sample_cases=format_sample_cases(sample_cases),
        history=format_history(history)
    )
    try:
        return _call(prompt, max_tokens=200, temperature=0.7)
    except Exception as e:
        print(f"Interviewer error: {e}")
        return "Tell me more about your approach."


def get_candidate_response(history: list, company_name: str,
                            case_context: str, role: str = "analyst") -> str:
    role_data = ROLE_CONTEXT.get(role, ROLE_CONTEXT["analyst"])
    prompt = CANDIDATE_SYSTEM_PROMPT.format(
        company_name=company_name,
        role_label=role_data["label"],
        case_context=case_context,
        history=format_history(history)
    )
    try:
        return _call(prompt, max_tokens=250, temperature=0.8)
    except Exception as e:
        print(f"Candidate error: {e}")
        return "I would start by structuring the problem..."


def get_feedback(candidate_response: str, company_name: str, case_context: str,
                  rubric: dict, role: str = "analyst") -> dict:
    role_data = ROLE_CONTEXT.get(role, ROLE_CONTEXT["analyst"])
    prompt = FEEDBACK_SYSTEM_PROMPT.format(
        company_name=company_name,
        role_label=role_data["label"],
        role_expectation=role_data["expectation"],
        candidate_response=candidate_response,
        case_context=case_context,
        rubric=json.dumps(rubric, indent=2),
        rubric_score_fields=build_rubric_score_fields(rubric)
    )
    default = {
        "scores": {}, "overall_score": 0,
        "strengths": [], "areas_of_improvement": [],
        "top_1_percent_response": "Could not generate.",
        "actionable_next_steps": [],
        "one_thing_to_improve": "Try again."
    }
    try:
        return _parse_json(_call(prompt, max_tokens=700, temperature=0.3))
    except Exception as e:
        print(f"Feedback error: {e}")
        return default


def solve_and_rate_case(case_text: str, company_name: str,
                         rubric: dict, sample_cases: list,
                         role: str = "analyst") -> dict:
    role_data = ROLE_CONTEXT.get(role, ROLE_CONTEXT["analyst"])
    prompt = SOLVE_AND_RATE_PROMPT.format(
        company_name=company_name,
        case_text=case_text,
        role_label=role_data["label"],
        role_expectation=role_data["expectation"],
        rubric=json.dumps(rubric, indent=2),
        sample_cases=format_sample_cases(sample_cases),
        rubric_score_fields=build_rubric_score_fields(rubric)
    )
    try:
        return _parse_json(_call(prompt, max_tokens=1500, temperature=0.2))
    except Exception as e:
        print(f"Solve error: {e}")
        return {}


def simulate_vp_interview(case_text: str, company_name: str,
                           rubric: dict, sample_cases: list,
                           role: str = "analyst") -> str:
    role_data = ROLE_CONTEXT.get(role, ROLE_CONTEXT["analyst"])
    prompt = SIMULATE_VP_PROMPT.format(
        company_name=company_name,
        case_text=case_text,
        role_label=role_data["label"],
        role_expectation=role_data["expectation"],
        rubric=json.dumps(rubric, indent=2),
        sample_cases=format_sample_cases(sample_cases)
    )
    try:
        return _call(prompt, max_tokens=2000, temperature=0.5)
    except Exception as e:
        print(f"Simulate error: {e}")
        return "Simulation failed. Please try again."


def get_sample_test_feedback(user_answer: str) -> dict:
    prompt = SAMPLE_TEST_FEEDBACK_PROMPT.format(
        question=SAMPLE_TEST_QUESTION["question"],
        user_answer=user_answer
    )
    default = {
        "score": 0,
        "what_they_got_right": "Could not evaluate.",
        "what_to_improve": "Try again.",
        "ideal_answer": SAMPLE_TEST_QUESTION["explanation"]
    }
    try:
        return _parse_json(_call(prompt, max_tokens=300, temperature=0.2))
    except Exception as e:
        print(f"Sample test error: {e}")
        return default