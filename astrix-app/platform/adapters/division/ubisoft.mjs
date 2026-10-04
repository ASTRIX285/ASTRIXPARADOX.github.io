/**
 * Ubisoft adapter: reserved for authorised read access, which Ubisoft has not
 * given. It always reports "not authorised". It imports nothing, makes no
 * network request, reads no cookies or storage and never asks for an account,
 * password or session token.
 */
const NOT_AUTHORISED = Object.freeze({
  available: false,
  state: 'not-authorised',
  reason: 'Ubisoft has not given authorised access to Division account data. WorkBench never asks for your Ubisoft sign-in. Enter your build by hand or import a build file.'
});

export function createUbisoftAdapter() {
  return Object.freeze({
    id: 'ubisoft',
    label: 'Ubisoft account',

    status() {
      return { ...NOT_AUTHORISED };
    },

    async load() {
      return { ok: false, state: NOT_AUTHORISED.state, reason: NOT_AUTHORISED.reason };
    }
  });
}

export const UBISOFT_ADAPTER = createUbisoftAdapter();
