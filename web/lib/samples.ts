// 체험용 샘플 세트 — 서류가 없는 사람도 한 번에 전 과정을 둘러보도록.
// 회사/직무/공고가 실제 공격 포인트와 EXAONE 질문을 구동하고(이게 핵심),
// 이력서는 PDF, 자소서는 텍스트로 멀티파일 업로드된다(데모상 mock OCR이라 내용은 보조).

import type { PersonaId } from "@/lib/contract/types";

export type SampleId = "dev" | "sales" | "pm";

export interface Sample {
  id: SampleId;
  label: string; // 인물/직군 라벨
  role: string; // 지원 직무
  company: string;
  stages: PersonaId[]; // 면접 단계(면접관 순서) — 직군에 맞게. tech=백엔드라 비기술직엔 제외.
  tagline: string; // 카드 한 줄 설명
  why: string; // 이 샘플이 보여주는 것 (가이드용)
  jobPosting: string; // 채용공고 본문 (→ 공격 포인트·질문 구동)
  resumePdf: string; // 미리 만들어 둔 정적 이력서 PDF 경로 (public/) — MISO OCR 테스트용
  resumePdfLines: string[]; // 정적 fetch 실패 시 클라 생성 폴백용 본문
  cover: string; // 자기소개서 텍스트 (첨부 파일)
}

export const SAMPLES: Sample[] = [
  {
    id: "dev",
    label: "백엔드 개발자",
    role: "백엔드 개발자",
    company: "토스",
    stages: ["tech", "culture", "exec"], // 개발자 = 기술 면접관 중심(tech) + 컬처핏·임원
    tagline: "4년차 · ‘p99 82% 개선’이라는데 어떤 구조로?",
    why: "기술 면접관이 설계 트레이드오프와 정량 근거(p99·QPS·규모)를 끝까지 캐묻습니다.",
    jobPosting:
      "[지원 직무] 백엔드 개발자 (Server / Backend Engineer)\n" +
      "[자격요건]\n" +
      "- 대규모 트래픽 처리 경험 (초당 수천 RPS, 대용량 데이터)\n" +
      "- 분산 시스템 설계·운영 및 성능 최적화 (p99 레이턴시·QPS)\n" +
      "- RDB/캐시/메시지큐 기반 아키텍처 설계 경험\n" +
      "[우대사항]\n" +
      "- 장애 대응·SRE, 이벤트 기반 아키텍처(Kafka 등)\n" +
      "- Kubernetes 기반 운영, 인덱스/쿼리 튜닝 경험\n" +
      "[주요업무]\n" +
      "- 핵심 서버 API 설계·개발, 성능/안정성 개선, 트래픽 대응",
    resumePdf: "/samples/resume-dev.pdf",
    resumePdfLines: [
      "Resume - Backend Engineer (Sample)",
      "Name: Lee (Sample Candidate)",
      "Applying: Toss / Backend Engineer",
      "",
      "Experience (4 yrs, Backend / Server)",
      "- Order settlement system handling ~2M tx/day",
      "- Redesigned indexes, p99 latency 1.8s -> 320ms ('big improvement')",
      "- Migrated monolith module to event-driven services",
      "- On-call, incident response, capacity planning",
      "",
      "Skills: Java, Spring, Kotlin, MySQL, Redis, Kafka, AWS, Docker, Kubernetes",
      "Education: BS, Computer Science",
      "",
      "(Note: scale/latency numbers are partly vague - interviewers will probe.)",
    ],
    cover:
      "자기소개서 — 이백엔드 (백엔드 개발자)\n" +
      "════════════════════════════════════\n" +
      "[지원 동기]\n" +
      "대규모 트래픽을 안정적으로 버티는 시스템을 설계하는 일에 매력을 느낍니다.\n" +
      "주문 정산 시스템에서 인덱스 재설계로 응답 지연을 크게 줄인 경험이 있고,\n" +
      "토스에서 더 큰 규모의 트래픽을 다뤄보고 싶어 지원했습니다.\n\n" +
      "[강점]\n" +
      "병목을 데이터로 찾아 트레이드오프를 따져 결정합니다. 일관성과 가용성\n" +
      "사이에서 상황에 맞는 선택을 해 본 경험이 있습니다.\n\n" +
      "[성장 방향]\n" +
      "분산 시스템의 장애 대응 자동화와 관측성(Observability)을 더 깊이 다루고 싶습니다.\n",
  },
  {
    id: "sales",
    label: "영업사원",
    role: "영업사원",
    company: "삼성전자",
    stages: ["culture", "exec", "hr"], // 영업 = 비기술직 → 컬처핏·임원·HR (기술 면접관 제외)
    tagline: "4년차 · B2B 영업 · ‘목표 초과’라는데 숫자를 캐물으면?",
    why: "임원·HR 면접관이 영업 실적의 정량 근거와 고객 설득 논리를 집요하게 캐묻습니다.",
    jobPosting:
      "[지원 직무] 영업사원 (B2B Sales / Account Executive)\n" +
      "[자격요건]\n" +
      "- B2B 영업 경험 3년 이상, 매출 목표 달성/초과 실적\n" +
      "- 고객 발굴·관계 관리·협상 및 클로징 역량\n" +
      "- 실적을 정량 지표(매출/전환율/파이프라인)로 설명할 수 있을 것\n" +
      "[우대사항]\n" +
      "- 대기업/엔터프라이즈 고객 영업, 제안서·견적 작성 경험\n" +
      "- CRM(예: Salesforce) 기반 파이프라인 관리\n" +
      "[주요업무]\n" +
      "- 신규 고객 발굴 및 기존 고객 관리, 매출 목표 달성\n" +
      "- 제안·협상·계약, 분기 실적 리뷰",
    resumePdf: "/samples/resume-sales.pdf",
    resumePdfLines: [
      "Resume - Sales Representative (Sample)",
      "Name: Kim (Sample Candidate)",
      "Applying: Samsung Electronics / B2B Sales",
      "",
      "Experience (4 yrs, B2B SaaS & Hardware Sales)",
      "- Exceeded annual quota (described as 'over target')",
      "- Managed key enterprise accounts",
      "- Led proposals and contract negotiations",
      "- Weekly pipeline review and forecasting",
      "",
      "Skills: Negotiation, Account Management, CRM (Salesforce), Proposal Writing",
      "Education: BA, Business Administration",
      "",
      "(Note: exact revenue/conversion figures are vague - interviewers will probe.)",
    ],
    cover:
      "자기소개서 — 김영업 (영업사원)\n" +
      "════════════════════════════════════\n" +
      "[지원 동기]\n" +
      "고객의 문제를 듣고 해결책으로 연결해 매출로 만드는 일에 보람을 느낍니다.\n" +
      "지난 4년간 B2B 영업에서 목표를 꾸준히 초과 달성했고, 삼성전자에서 더 큰\n" +
      "엔터프라이즈 고객을 맡아 성장하고 싶어 지원했습니다.\n\n" +
      "[강점]\n" +
      "거절을 두려워하지 않고 끈질기게 관계를 만듭니다. 까다로운 고객도 니즈를\n" +
      "파고들어 제안 구조를 바꿔 클로징한 경험이 있습니다.\n\n" +
      "[성장 방향]\n" +
      "실적을 더 정밀한 지표로 관리하고, 대형 딜의 협상력을 키우고 싶습니다.\n",
  },
  {
    id: "pm",
    label: "프로덕트 매니저",
    role: "프로덕트 매니저",
    company: "배달의민족",
    stages: ["culture", "exec", "hr"], // PM = 비백엔드 → 컬처핏·임원·HR (백엔드 기술 면접관 제외)
    tagline: "4년차 · ‘리텐션 20% 개선’ — 근데 어떻게 측정했죠?",
    why: "PM 플레이북으로 전환되어, 임팩트의 정량 근거와 의사결정 이유를 집요하게 캐묻습니다.",
    jobPosting:
      "[지원 직무] 프로덕트 매니저 (Growth)\n" +
      "[자격요건]\n" +
      "- 데이터 기반 의사결정 경험 (핵심 지표 정의·측정·해석)\n" +
      "- 전환율·리텐션 등 그로스 지표 개선 가설 수립 및 A/B 실험 설계\n" +
      "- 개발/디자인/마케팅 등 다부서 이해관계자 조율 경험\n" +
      "[우대사항]\n" +
      "- 커머스/플랫폼 그로스 경험, SQL 기반 데이터 분석\n" +
      "[주요업무]\n" +
      "- 제품 가설 수립 → 실험 → 핵심 지표 개선, 로드맵 우선순위 결정",
    resumePdf: "/samples/resume-pm.pdf",
    resumePdfLines: [
      "Resume - Product Manager (Sample)",
      "Name: Park (Sample Candidate)",
      "Applying: Baemin / Growth PM",
      "",
      "Experience (4 yrs, Growth PM)",
      "- Reworked onboarding flow, retention improved ~20%",
      "- Shipped personalized recommendations (conversion up)",
      "- Ran weekly metric reviews, quarterly roadmap",
      "",
      "Skills: Product Strategy, Metrics Design, A/B Testing, Figma, basic SQL",
      "Education: BA, Business Administration",
      "",
      "(Note: '~20%' baseline/measurement is vague - interviewers will probe.)",
    ],
    cover:
      "자기소개서 — 박프로 (프로덕트 매니저)\n" +
      "════════════════════════════════════\n" +
      "[지원 동기]\n" +
      "사용자의 문제를 데이터로 정의하고 빠르게 검증하는 일을 좋아합니다.\n" +
      "온보딩을 개편하며 가설→실험→지표 개선을 주도했고, 배달의민족에서 더 큰\n" +
      "사용자 임팩트를 만들고 싶어 지원했습니다.\n\n" +
      "[강점]\n" +
      "여러 팀이 같은 지표를 보도록 정렬하는 데 강점이 있습니다.\n\n" +
      "[성장 방향]\n" +
      "임팩트를 더 엄밀하게 측정하고 실험 설계의 깊이를 키우고 싶습니다.\n",
  },
];

export function getSample(id: string | null): Sample | undefined {
  if (id === "1") return SAMPLES[0]; // 하위호환: ?sample=1 → 첫 샘플
  return SAMPLES.find((s) => s.id === id);
}

// ── 최소 유효 PDF 생성 (라이브러리 0, 오프셋 직접 계산) ──
// 라틴/영문만 렌더(Helvetica). 한글은 폰트 임베딩이 필요해 PDF엔 영문 요약을 넣는다.
// 데모는 mock OCR이라 내용 무관 — '진짜 PDF 업로드' 시연 + 실 OCR 대비 유효성 확보.
function buildResumePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/([()\\])/g, "\\$1");
  let content = "BT /F1 15 Tf 50 800 Td (" + esc(lines[0] ?? "Resume") + ") Tj /F1 11 Tf";
  let dy = -28;
  for (const l of lines.slice(1)) {
    content += " 0 " + dy + " Td (" + esc(l) + ") Tj";
    dy = -15;
  }
  content += " ET";
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    "<</Length " + content.length + ">>\nstream\n" + content + "\nendstream",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

// 샘플의 이력서(PDF)+자소서(txt)를 멀티파일 업로드용 File 배열로 변환.
// 이력서: 미리 만들어 둔 정적 PDF(public/)를 가져온다 — 실제 MISO OCR 테스트가 이 파일로 동작.
// 정적 fetch 실패 시 클라에서 동일 내용 PDF 생성으로 폴백(오프라인/경로오류 대비).
export async function sampleFiles(s: Sample): Promise<File[]> {
  let pdfBlob: BlobPart;
  try {
    const res = await fetch(s.resumePdf);
    if (!res.ok) throw new Error(String(res.status));
    pdfBlob = await res.blob();
  } catch {
    pdfBlob = buildResumePdf(s.resumePdfLines) as BlobPart;
  }
  return [
    new File([pdfBlob], `이력서_${s.label}.pdf`, { type: "application/pdf" }),
    new File([s.cover], `자기소개서_${s.label}.txt`, { type: "text/plain" }),
  ];
}
