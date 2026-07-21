type DocLine = {
  number: number;
  to: number;
};

type DocLike = {
  lines: number;
  lineAt: (position: number) => DocLine;
};

export function selectedLineNumbersForComment(doc: DocLike, from: number, to: number) {
  if (from === to) return [doc.lineAt(from).number];

  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const startLine = doc.lineAt(start);
  const endLine = doc.lineAt(Math.max(start, end - 1));
  const startLineNo = start === startLine.to && start < end && startLine.number < doc.lines
    ? startLine.number + 1
    : startLine.number;

  if (startLineNo > endLine.number) return [];

  return Array.from(
    { length: endLine.number - startLineNo + 1 },
    (_, idx) => startLineNo + idx
  );
}
