"""SkillsMiddleware analog — 페르소나/프레임워크 = SKILL.md 한 장.

부록 A 확장 전략("시나리오=플레이북 한 벌, 엔진 불변")이 구조적으로 참:
새 도메인(연봉협상 BATNA/ZOPA 등)은 여기 PERSONAS/FRAMEWORK만 추가하면 됨.
"""
from __future__ import annotations

PERSONAS: list[dict] = [
    {
        "id": "tech",
        "name": "기술 면접관",
        "persona": "시니어 백엔드. 설계 트레이드오프와 정량 근거를 끝까지 캐묻는다. 두루뭉술한 답을 가장 싫어함.",
        "openingLine": "이력서에 대규모 트래픽 처리 경험을 적으셨는데, 구체적으로 초당 몇 건을 어떤 구조로 처리했는지부터 말씀해 주시죠.",
        "tools": ["lookup_job_posting", "check_answer_quality", "lookup_playbook", "update_weakness_profile", "escalate"],
    },
    {
        "id": "culture",
        "name": "컬처핏 면접관",
        "persona": "동료 평판과 협업 방식을 본다. 갈등 상황의 실제 행동을 STAR로 파고든다.",
        "openingLine": "팀에서 의견이 강하게 충돌했던 순간 하나를 떠올려 주세요. 그때 본인이 실제로 한 행동이 궁금합니다.",
        "tools": ["lookup_company_reputation", "check_answer_quality", "lookup_playbook", "update_weakness_profile"],
    },
    {
        "id": "exec",
        "name": "임원",
        "persona": "사업 임팩트와 의사결정 근거를 본다. 압박이 강하고 커브볼을 던진다.",
        "openingLine": "솔직히, 지금 지원자보다 경력 많은 후보가 줄 서 있습니다. 우리가 굳이 당신을 뽑아야 할 이유 한 가지만 대보세요.",
        "tools": ["lookup_job_posting", "check_answer_quality", "escalate", "update_weakness_profile"],
    },
    {
        "id": "hr",
        "name": "HR",
        "persona": "동기와 장기 비전, 처우 기대를 확인한다. 차분하지만 일관성 허점을 놓치지 않는다.",
        "openingLine": "왜 지금 이직을 결심하셨는지, 그리고 3년 뒤 어떤 모습을 그리는지 들려주세요.",
        "tools": ["check_answer_quality", "lookup_playbook", "update_weakness_profile"],
    },
]

FRAMEWORK = {
    "name": "STAR / 역량면접",
    "checks": ["Situation(상황) 맥락", "Task(과제)", "Action(본인 행동)", "Result(정량 성과)"],
}

# 면접 길이 프리셋 = 메인질문(라운드) 목표 수. bootstrap(length=) 파라미터.
LENGTH_PRESETS = {"short": 2, "standard": 3, "deep": 5}

# 라운드당 최대 꼬리질문 수 — 약점 신호가 잡힐 때만 발사 (FR-009).
MAX_FOLLOWUP = 2

# FR-005 플레이북 스왑 — 직무 키워드 → 플레이북 id. "엔진 불변, 데이터만 추가" 원칙.
PLAYBOOKS: dict[str, dict] = {
    "backend": {"label": "백엔드/서버", "keywords": ["백엔드", "서버", "backend", "server", "인프라", "devops", "데이터", "플랫폼"]},
    "frontend": {"label": "프론트엔드", "keywords": ["프론트", "frontend", "웹", "web", "react", "ui", "client"]},
    "pm": {"label": "기획/PM", "keywords": ["기획", "pm", "product", "프로덕트", "매니저", "기획자"]},
    "general": {"label": "일반", "keywords": []},
}


def detect_playbook(company: str, role: str) -> str:
    """직무 문자열 → 플레이북 id (FR-005). 매칭 없으면 general."""
    hay = f"{company} {role}".lower()
    for pid, p in PLAYBOOKS.items():
        if pid == "general":
            continue
        if any(k.lower() in hay for k in p["keywords"]):
            return pid
    return "general"

# mock 캔드 데이터 (BFF TS mock과 동일 사양) — 실 어댑터 도착 시 ports.mock 교체
ATTACK_POINTS = [
    "대규모 트래픽 경험이 이력서에 비해 정량 지표로 뒷받침되지 않음",
    "리더십/협업 사례가 추상적 — 본인 기여와 팀 성과가 분리되지 않음",
    "지원 직무의 핵심 요구스킬(분산 시스템 운영) 직접 경험 근거 부족",
]

QUESTION_BANK: dict[str, list[list[str]]] = {
    "tech": [
        [
            "방금 말씀하신 성능 개선, 개선 전후 수치를 정확히 말씀해 주세요. p99 레이턴시는요?",
            "그 구조에서 트래픽이 10배가 되면 가장 먼저 터지는 병목은 어디입니까?",
        ],
        [
            "아까 답변이 다소 두루뭉술했습니다. 이번엔 숫자로만 답해 주세요 — 정확히 무엇을 몇 % 개선했습니까?",
            "직접 설계한 부분과 남이 만든 걸 운영만 한 부분을 분리해서 말씀해 주세요.",
        ],
    ],
    "exec": [
        [
            "그게 회사 매출에 얼마나 기여했습니까? 금액이나 비율로요.",
            "당신의 그 결정이 틀렸다면 회사는 얼마를 잃었을까요?",
        ],
        [
            "여전히 '우리'라고 말씀하시네요. '제가' 무엇을 결정했는지만 듣고 싶습니다.",
            "경쟁 후보가 더 화려한 스펙을 들고 왔습니다. 마지막으로 본인을 변호해 보세요.",
        ],
    ],
}

FILLER_WORDS = ["음", "어", "그", "뭐", "이제", "약간", "사실"]

# 모호·회피 표현 (hedging 신호) — WEAK_LABEL["hedging"]와 짝
HEDGE_WORDS = ["보통", "그냥", "대충", "어느 정도", "어느정도", "아마", "거의", "대략", "뭐랄까", "그런 편"]

# ── 자가진화 닫힌 루프(FR-011): 직전 라운드 '약점 종류' → R2+ 공략 질문 ──
# 핵심: R1에서 measure된 약점(kind)이 R2 질문을 실제로 바꾼다.
#   - 숫자 안 댄 사람 → no_number 공략질문 / 숫자 잘 댄 사람 → none(에스컬레이션)
#   = "2R 질문이 1R 약점에 매핑되어 추적 가능"(PRD 성공지표). turn_idx로 변형.
EVOLVE_QUESTIONS: dict[str, list[str]] = {
    "no_number": [
        "아까는 ‘많이 개선했다’고만 하셨죠. 임원 입장에선 숫자 없으면 안 믿습니다. 정확히 몇 %를, 어떤 지표(p99·QPS·매출)로 개선했는지 수치로만 답해 주세요.",
        "여전히 정성적입니다. 이번 답은 숫자로 시작하세요 — 규모, 개선율, 기간을 명확히.",
    ],
    "hedging": [
        "방금 ‘보통’, ‘그냥’이라 하셨는데 그건 답이 아닙니다. 본인이 직접 내린 결정 하나만, 모호한 표현 없이 단정적으로 말해 보세요.",
        "‘아마/거의’ 빼고. 그 선택에서 본인이 무엇을 포기했고 왜 그게 옳았습니까?",
    ],
    "vague": [
        "아까 답변이 두루뭉술했습니다. 추상론 빼고 구체적 사례 하나를 상황–행동–결과로 다시 말씀해 주세요.",
        "여전히 일반론이네요. ‘제가’ 실제로 한 행동만 콕 집어 말하세요.",
    ],
    "filler": [
        "조금 전 머뭇거림이 많았습니다. 이번엔 두괄식 — 핵심 한 문장 먼저 던지고 부연하세요.",
        "망설이지 말고 결론부터. 한 줄로 단정하고 근거를 붙이세요.",
    ],
    "none": [  # R1을 잘 답함 → 에스컬레이션 (FR-017: 잘하면 면접관이 세짐)
        "좋습니다, 근거가 탄탄하네요. 그럼 난이도를 올리죠 — 그 결정이 틀렸다면 회사는 얼마를 잃었고, 그 리스크를 어떻게 통제했습니까?",
        "수치가 명확하네요. 더 깊이 — 트래픽이 10배가 되면 그 구조에서 가장 먼저 터지는 병목은 어디고 어떻게 막겠습니까?",
    ],
}
