export type KnowledgeTopic =
  | "cycle"
  | "semen"
  | "hormone"
  | "insurance"
  | "clinic"
  | "cpt"
  | "calls"
  | "couple"
  | "general";

export interface KnowledgeChunk {
  sourceFile: string;
  section: string;
  content: string;
  topic: KnowledgeTopic;
}

export interface RetrievedChunk extends KnowledgeChunk {
  similarity: number;
}

export interface RagRetrievalResult {
  chunks: RetrievedChunk[];
  mode: "vector" | "keyword";
}
