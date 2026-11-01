/*  The video controls: play the farm tour, record it to a file, stop.

    The caption and the progress line are drawn twice on purpose. On screen they
    are DOM — crisp text at any window size, no font atlas. In the recording they
    are painted into the compositor canvas (see `recorder.ts`), because a canvas
    stream cannot see the DOM. Both read from the same tour, so they cannot
    disagree. */

export interface VideoPanel {
  readonly root: HTMLElement;
  /** The tour caption and how far through the tour, 0 to 1. Progress < 0 hides. */
  setCaption(text: string, progress: number): void;
  setStatus(text: string): void;
  setRecording(recording: boolean): void;
  /** While a tour plays, play and record are disabled and stop is live. */
  setEnabled(playing: boolean): void;
  dispose(): void;
}

export interface VideoHandlers {
  onPlay(): void;
  onRecord(): void;
  onStop(): void;
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (action: "play" | "record" | "stop", text: string, title: string): HTMLButtonElement => {
  const node = element("button", `video__key video__key--${action}`, text);
  node.type = "button";
  node.dataset.action = action;
  node.title = title;
  node.setAttribute("aria-label", title);
  return node;
};

export function mountVideoPanel(container: HTMLElement, handlers: VideoHandlers): VideoPanel {
  const root = element("section", "video");
  root.setAttribute("aria-label", "Video");

  const row = element("div", "video__row");
  const play = button("play", "▶ Tour", "Play the farm tour without recording it");
  const record = button("record", "● Record tour", "Record the farm tour to a WebM file");
  const stop = button("stop", "■ Stop", "Stop the tour and keep what was recorded");
  row.append(play, record, stop);

  const status = element("div", "video__status", "");

  const caption = element("div", "tour");
  const captionText = element("div", "tour__caption", "");
  const bar = element("div", "tour__bar");
  const fill = element("div", "tour__fill", "");
  bar.append(fill);
  caption.append(captionText, bar);

  root.append(row, status);
  container.append(root, caption);

  play.addEventListener("click", () => handlers.onPlay());
  record.addEventListener("click", () => handlers.onRecord());
  stop.addEventListener("click", () => handlers.onStop());

  const setDisabled = (node: HTMLButtonElement, disabled: boolean): void => {
    node.disabled = disabled;
    node.classList.toggle("video__key--off", disabled);
  };

  return {
    root,
    setCaption(text, progress) {
      const showing = progress >= 0;
      caption.classList.toggle("tour--on", showing);
      if (!showing) {
        if (captionText.textContent !== "") captionText.textContent = "";
        fill.style.width = "0%";
        return;
      }
      if (captionText.textContent !== text) captionText.textContent = text;
      fill.style.width = `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`;
    },
    setStatus(text) {
      if (status.textContent !== text) status.textContent = text;
    },
    setRecording(recording) {
      record.classList.toggle("video__key--recording", recording);
      setDisabled(record, recording);
    },
    setEnabled(playing) {
      setDisabled(play, playing);
      setDisabled(record, playing);
      setDisabled(stop, !playing);
    },
    dispose() {
      root.remove();
      caption.remove();
    },
  };
}
