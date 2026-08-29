import type { ListColor, ListIconKey } from "./lists.constants.js";

export interface PersonalList {
  id: number;
  name: string;
  iconKey: ListIconKey;
  color: ListColor;
  isDefault: boolean;
  displayOrder: number;
}

export interface PersonalListRecord {
  id: number | string;
  name: string;
  iconKey: string;
  color: string;
  isDefault: boolean;
  displayOrder: number;
}

export interface CreateListInput {
  name: string;
  iconKey: ListIconKey;
  color: ListColor;
}

export interface UpdateListInput {
  name?: string | undefined;
  iconKey?: ListIconKey | undefined;
  color?: ListColor | undefined;
}
