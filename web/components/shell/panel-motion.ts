// Motion's duration-based spring, sampled every 5ms at duration=300ms,
// bounce=0.1, mass=1 and initial velocity=0. No runtime spring dependency.
// Reference: https://motion.dev/docs/spring (Motion, MIT).
export const PANEL_MOTION_DURATION = 0.3;
const springSamples = [
  0, 0.0091786, 0.0337443, 0.0698081, 0.1141519, 0.1641348, 0.2176098,
  0.2728507, 0.328488, 0.3834528, 0.4369283, 0.4883072, 0.5371557, 0.583182,
  0.6262095, 0.666154, 0.7030048, 0.7368078, 0.7676523, 0.7956598, 0.8209743,
  0.843755, 0.8641698, 0.8823908, 0.8985898, 0.9129358, 0.9255924, 0.9367162,
  0.9464557, 0.9549502, 0.9623299, 0.9687153, 0.9742172, 0.9789372, 0.9829678,
  0.986393, 0.9892884, 0.991722, 0.9937547, 0.9954407, 0.9968283, 0.9979601,
  0.9988735, 0.9996016, 1.0001732, 1.0006133, 1.0009437, 1.0011833, 1.0013482,
  1.0014524, 1.0015075, 1.0015238, 1.0015095, 1.0014719, 1.0014168, 1.0013491,
  1.0012729, 1.0011913, 1.0011072, 1.0010224, 1,
];

export function panelSpringEase(progress: number) {
  const index = Math.max(0, Math.min(1, progress)) * (springSamples.length - 1);
  const start = Math.floor(index);
  const end = Math.min(start + 1, springSamples.length - 1);
  return (
    springSamples[start] +
    (springSamples[end] - springSamples[start]) * (index - start)
  );
}
