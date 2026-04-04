import raw from "./floor2Nodes.json";

export type Floor2Node = { id: string; xFeet: number; yFeet: number };

/** BHEE floor 2 graph nodes (feet, building frame). Source: aws_resources/data_population/floor_data/floor2.py */
export const FLOOR2_NODES: Floor2Node[] = raw as Floor2Node[];
