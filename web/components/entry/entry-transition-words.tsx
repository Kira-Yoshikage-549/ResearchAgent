import styles from "./entry-transition.module.css";

export function splitEntryWords(text: string, locale: string): string[] {
  if (locale.startsWith("zh")) {
    if (typeof Intl.Segmenter !== "function") return [text];
    return Array.from(
      new Intl.Segmenter(locale, { granularity: "word" }).segment(text),
      (part) => part.segment,
    );
  }
  return text.split(/(\s+)/).filter(Boolean);
}

export function EntryTransitionWords({
  text,
  locale,
}: {
  text: string;
  locale: string;
}) {
  return splitEntryWords(text, locale).map((word, index) =>
    /^\s+$/.test(word) ? (
      word
    ) : (
      <span key={index} className={styles.wordMask}>
        <span className={styles.word} data-entry-word>
          {word}
        </span>
      </span>
    ),
  );
}
