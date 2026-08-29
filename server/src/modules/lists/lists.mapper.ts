import { AppError } from "../../shared/errors/app-error.js";
import { parsePositiveIntegerId } from "../../shared/utils/id.utils.js";
import { LIST_COLORS, LIST_ICON_KEYS } from "./lists.constants.js";
import type { PersonalList, PersonalListRecord } from "./lists.types.js";

export function mapPersonalList(record: PersonalListRecord): PersonalList {
  if (!LIST_ICON_KEYS.some((iconKey) => iconKey === record.iconKey)) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_LIST_ICON_CONFIGURATION",
      message: "A personal list has an unsupported icon configuration.",
    });
  }

  if (!LIST_COLORS.some((color) => color === record.color.toUpperCase())) {
    throw new AppError({
      statusCode: 500,
      code: "INVALID_LIST_COLOR_CONFIGURATION",
      message: "A personal list has an unsupported color configuration.",
    });
  }

  return {
    ...record,
    id: parsePositiveIntegerId(record.id, "list id"),
    iconKey: record.iconKey as PersonalList["iconKey"],
    color: record.color.toUpperCase() as PersonalList["color"],
  };
}
