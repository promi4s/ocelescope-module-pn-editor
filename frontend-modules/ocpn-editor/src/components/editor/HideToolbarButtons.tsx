import { useRef, useEffect } from "react";

export const HideToolbarButtons = ({ labels }: { labels: string[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const lowerLabels = labels.map((l) => l.toLowerCase());

  useEffect(() => {
    const container = ref.current?.parentElement;
    if (!container) return;

    const hideMatching = () => {
      const buttons = container.querySelectorAll("button");
      buttons.forEach((btn) => {
        const insideRadioGroup = !!btn.closest('[role="radiogroup"]');
        const text = btn.textContent?.trim().toLowerCase();
        const shouldHide =
          !insideRadioGroup && !!text && lowerLabels.includes(text);
        btn.style.display = shouldHide ? "none" : "";
      });
    };

    hideMatching();
    const observer = new MutationObserver(hideMatching);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [lowerLabels]);

  return <div ref={ref} style={{ display: "none" }} />;
};
