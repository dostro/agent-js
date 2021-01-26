import { shallow, mount } from 'enzyme';
import * as React from 'react';
import { StateToStringCodec, Codec } from './state-serialization';
import { IdentityProviderState } from './state';
import { IStorage } from 'src/relying-party-demo/storage';
import { SerializedStorage } from './state-storage';

import { IdentityProviderStateType } from './state';

describe('@dfinity/identity-provider/design-phase-0/state-storage', () => {
  it('works', () => {
    let str: string = 'init';
    const storage = SerializedStorage(
      {
        get() {
          return str;
        },
        set(input: string) {
          str = input;
        },
      },
      StateToStringCodec(IdentityProviderStateType),
    );
    const state0: IdentityProviderState = {
      authentication: {
        consent: undefined,
        request: undefined,
        foo: 'state-storage.test.ts foo',
      },
      identities: {
        root: {
          publicKey: undefined,
          sign: undefined,
        },
      },
      delegation: {
        target: undefined,
      },
      webAuthn: {
        webAuthnWorks: true,
      },
    };
    storage.set(state0);
    expect(storage.get()).toEqual(state0);
  });
});