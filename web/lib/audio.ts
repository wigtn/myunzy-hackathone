// 오디오 컨테이너 mime → 파일 확장자 매핑. 녹음(InputBar)·업로드(api)·STT 전송(sttClient)이
// 동일 규칙을 쓰도록 단일화 (브라우저별 webm/opus, Safari mp4, ogg 대응).
export function extForMime(mimeType: string): "mp4" | "ogg" | "webm" {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
