import { AppError } from "../../shared/errors/app-error.js";
import type { UserPreferences } from "../auth/auth.types.js";
import { preferencesRepository } from "./preferences.repository.js";
import type { UpdatePreferencesBody } from "./preferences.schemas.js";

export interface PreferencesService {
  update(userId: number, input: UpdatePreferencesBody): Promise<UserPreferences>;
}

export const preferencesService: PreferencesService = {
  async update(userId, input) {
    const preferences = await preferencesRepository.updatePreferences(userId, input);

    if (!preferences) {
      throw new AppError({
        statusCode: 500,
        code: "PREFERENCES_UPDATE_FAILED",
        message: "TaskHub preferences could not be updated.",
      });
    }

    return preferences;
  },
};
