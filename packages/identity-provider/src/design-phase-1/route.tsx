import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Switch, useRouteMatch, useLocation, Redirect  } from 'react-router-dom';
import WelcomeScreen from './screens/WelcomeScreen';
import IdentityConfirmationScreen from './screens/IdentityConfirmationScreen';
import SessionConsentScreen from './screens/SessionConsentScreen';
import AuthenticationResponseConfirmationScreen from './screens/AuthenticationResponseConfirmationScreen';
import { useReducer } from './state/reducer';
import { SerializedStorage, IStorage, LocalStorageKey, NotFoundError } from './state/state-storage';
import { useStateStorage } from './state/state-storage-react';
import { StateToStringCodec } from './state/state-serialization';
import { useState } from './state/state-react';

const stateStorage = SerializedStorage(
    LocalStorageKey('design-phase-1'),
    StateToStringCodec(),
)

export default function DesignPhase0Route(props: {
    NotFoundRoute: React.ComponentType
}) {
    const NotFoundRoute = props.NotFoundRoute;
    const location = useLocation()
    const { url, path } = useRouteMatch()
    const initialState = React.useMemo(
        () => {
            try {
                const initialStateFromStorage = stateStorage.get();
                return initialStateFromStorage;
            } catch (error) {
                if (error instanceof NotFoundError) {
                    console.debug('Nothing in StateStorage. This must be the first time');
                    return;
                }
                throw error;
            }
        },
        [stateStorage],
    )
    const [state, dispatch] = useState(initialState)
    useStateStorage(stateStorage, state, dispatch);
    const urls = {
        identity: {
            confirmation: `${path}/identity/confirmation`,
        },
        session: {
            consent: `${path}/session/consent`,
        },
        response: {
            confirmation: `${path}/response/confirmation`,
        }
    };
    function onClickAuthenticationRequestReceived() {
        dispatch({
            type: "AuthenticationRequestReceived",
            payload: {
                loginHint: Math.random().toString().slice(2),
            }
        })
    }
    return <>
        <Switch>
            <Route exact path={`${path}`}>
                <Redirect to={`${path}/welcome${location.search}`} />
            </Route>
            <Route exact path={`${path}/welcome`}>
                <WelcomeScreen
                    next={urls.identity.confirmation}
                />
            </Route>
            <Route exact path={urls.identity.confirmation}>
                <IdentityConfirmationScreen
                    next={urls.session.consent}
                />
            </Route>
            <Route exact path={urls.session.consent}>
                <SessionConsentScreen
                    next={urls.response.confirmation}
                />
            </Route>
            <Route exact path={urls.response.confirmation}>
                <AuthenticationResponseConfirmationScreen />
            </Route>
            <NotFoundRoute />
        </Switch>
        <details>
            <summary>state</summary>
            <pre>{JSON.stringify(state, null, 2)}</pre>
            <button onClick={onClickAuthenticationRequestReceived}>AuthenticationRequestReceived</button>
        </details>
    </>
}
