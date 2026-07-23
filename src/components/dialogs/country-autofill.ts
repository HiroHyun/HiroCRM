// Pure state machine for the Add-lead dialog's Country field: the field
// live-mirrors detectCountry(contact) until the user manually overrides it;
// clearing the override resumes auto-detect.
import { detectCountry } from "../../lib/contact";

export interface CountryFieldState {
  value: string;
  touched: boolean;
}

/** Field state for a freshly opened dialog with the given contact input. */
export function initialCountryState(contact: string): CountryFieldState {
  return { value: detectCountry(contact) ?? "", touched: false };
}

/** Contact input changed: re-detect only while the user hasn't overridden. */
export function onContactChange(
  state: CountryFieldState,
  contact: string,
): CountryFieldState {
  if (state.touched) return state;
  const detected = detectCountry(contact) ?? "";
  return detected === state.value ? state : { value: detected, touched: false };
}

/**
 * User edited the country field directly. A non-empty value freezes it
 * (touched wins forever); clearing to "" resumes auto-detect from the current
 * contact.
 */
export function onCountryEdit(
  state: CountryFieldState,
  next: string,
  contact: string,
): CountryFieldState {
  if (next === "") return { value: detectCountry(contact) ?? "", touched: false };
  return { value: next, touched: true };
}
