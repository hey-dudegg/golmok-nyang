// 시험 출력에서 실패를 나타내는 줄을 모두 뽑는다(끝 30줄 자르기와 무관하게 보존). run_all.js가 쓴다.
function failLines(out) {
  return String(out).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => /^\s*FAIL/.test(l) || /FAIL|✗/.test(l));
}
module.exports = { failLines };
