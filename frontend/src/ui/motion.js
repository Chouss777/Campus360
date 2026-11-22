// Presentation only: preserve mounted forms, focus handling and business state.
export function revealSurface(element, { distance = 6, duration = 220 } = {}) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return null;
  return element.animate(
    [
      { opacity: 0.8, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
}
