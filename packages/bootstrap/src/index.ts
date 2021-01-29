import {
  Actor,
  createAssetCanisterActor,
  GlobalInternetComputer,
  HttpAgent,
  IDL,
  Principal,
  AnonymousIdentity,
  SignIdentity,
} from '@dfinity/agent';
import { createAgent } from './host';
import { SiteInfo, withIdentity } from './site';
import { makeLog } from './log';
import { IdentityActor, DocumentIdentities } from './actors/identity';
import MutableIdentity from './actors/identity/MutableIdentity';
import { BootstrapRenderer } from './render';
import { EventIterable } from './dom-events';
import { resolve } from 'path';

declare const window: GlobalInternetComputer & Window;

const bootstrapLog = makeLog('bootstrap');
const render = BootstrapRenderer(document);

_main({ render }).catch(err => {
  bootstrapLog('error', 'caught error', { error: err });
  const div = document.createElement('div');
  div.innerText = 'An error happened:';
  const pre = document.createElement('pre');
  pre.innerHTML = err.stack;
  div.appendChild(pre);
  render(div);
  throw err;
});

// Retrieve and execute a JavaScript file from the server.
async function _loadJs(
  canisterId: Principal,
  filename: string,
  onload = async () => {},
): Promise<any> {
  bootstrapLog('debug', '_loadJs', { canisterId, filename });
  const actor = createAssetCanisterActor({ canisterId });
  const content = await actor.retrieve(filename);
  const js = new TextDecoder().decode(new Uint8Array(content));
  // const dataUri = new Function(js);

  // Run an event function so the callee can execute some code before loading the
  // Javascript.
  await onload();

  // TODO(hansl): either get rid of eval, or rid of webpack, or make this
  // work without this horrible hack.
  return eval(js); // tslint:disable-line
}

async function _loadCandid(canisterId: Principal): Promise<any> {
  bootstrapLog('debug', '_loadCandid');
  const origin = window.location.origin;
  const url = `${origin}/_/candid?canisterId=${canisterId.toText()}&format=js`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot fetch candid file`);
  }
  const js = await response.text();
  const dataUri = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(js);
  // TODO(hansl): either get rid of eval, or rid of webpack, or make this
  // work without this horrible hack.
  return eval('import("' + dataUri + '")'); // tslint:disable-line
}

/**
 * boot @dfinity/bootstrap
 * @param spec.render {Function} change the Element that should display to the end-user
 */
async function _main(spec: { render: ReturnType<typeof BootstrapRenderer> }) {
  bootstrapLog('debug', '_main');
  /** update features ASAP (in case other code detects them) */
  window.ic = {
    ...window.ic,
    features: {
      ...window.ic?.features,
      authn: true,
    },
  };
  const site = await SiteInfo.fromWindow();
  const initialIdentity = new AnonymousIdentity();
  const identities = async function* () {
    yield initialIdentity;
    for await (const docId of DocumentIdentities(document)) {
      bootstrapLog('debug', 'ben got docId', docId)
      yield docId
    }
  }
  const beforeunload = new Promise(resolve => {
    document.addEventListener('beforeunload', event => resolve(event), { once: true });
  });

  IdentityActor({
    eventTarget: document,
    initialIdentity,
    identities: identities(),
    cancel: beforeunload,
  });

  const agent = await createAgent(withIdentity(await MutableIdentity(identities()))(site));

  // Find the canister ID. Allow override from the url with 'canister_id=1234..'.
  const canisterId = site.principal;
  window.ic = {
    ...window.ic,
    agent,
    canister: canisterId && Actor.createActor(({ IDL: IDL_ }) => IDL_.Service({}), { canisterId }),
    HttpAgent,
    IDL,
  };

  if (!canisterId) {
    // Show an error.
    const div = document.createElement('div');
    div.innerText =
      'Could not find the canister ID to use. Please provide one in the query parameters.';
    render(div);
  } else {
    if (window.location.pathname === '/candid') {
      // Load candid.did.js from endpoint.
      const candid = await _loadCandid(canisterId);
      const canister = window.ic.agent.makeActorFactory(candid.default)({ canisterId });
      const render = await import('./candid/candid');
      render.render(canisterId, canister);
    } else {
      // Load index.js from the canister and execute it.
      await _loadJs(canisterId, 'index.js', async () => {
        const progress = document.getElementById('ic-progress');
        if (progress) progress.remove();
      });
    }
  }
}
