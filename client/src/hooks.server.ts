import { redirect, type Handle, type HandleServerError } from "@sveltejs/kit";
import type { AuthRequest } from "$lib/proto/proto/AuthRequest";
import { createMetadata } from "$lib/metadata";
import { usersClient } from "$lib/grpc";
import type { DecodedIdToken } from "firebase-admin/lib/auth/token-verifier";
import { getFirebaseServer } from "$lib/firebase/firebase_server";
import { URI_USERS } from "$env/static/private";
import type { User__Output } from "$lib/proto/proto/User";

export const handleError: HandleServerError = ({ error }) => {
    console.error("Error: %s", error);
    if (error instanceof Error) {
        return {
            message: error.message,
            code: "UNKNOWN",
        };
    }
    return {
        message: "Unknown error",
        code: "UNKNOWN",
    };
};

export const handle: Handle = async ({ event, resolve }) => {
    const now = performance.now();
    const emptySession = {
        userId: "",
        paymentId: "",
        email: "",
        role: "",
        isSubscribed: false,
    };

    const session = event.cookies.get("session") ?? "";
    if (!session || session === "") {
        console.info("No session found");
        event.locals = emptySession;
    } else {
        let decodedClaims: DecodedIdToken | undefined = undefined;
        try {
            const admin = getFirebaseServer();
            decodedClaims = await admin
                .auth()
                .verifySessionCookie(session, false);
        } catch (err) {
            console.error("Error verifying session cookie", err);
            event.locals = emptySession;
        }
        if (!decodedClaims) {
            console.error("No decoded claims found");
            event.locals = emptySession;
        } else {
            console.info("User session verified");

            /**
             * Authenticate user agains our server
             * @param {string} uid - Firebase user id
             * @param {string} email - Firebase user email
             */
            try {
                const { uid, email } = decodedClaims;
                const request: AuthRequest = {
                    sub: uid,
                    email: email ?? "",
                };
                const metadata = await createMetadata(URI_USERS);
                const user = await new Promise<User__Output>((res, rej) => {
                    usersClient.Auth(request, metadata, (err, response) => {
                        err || !response?.id ? rej(err) : res(response);
                    });
                });
                event.locals = {
                    userId: user.id,
                    email: user.email,
                    role: user.role,
                    paymentId: user.paymentId ?? "",
                };
            } catch (err) {
                console.error("Error authenticating user", err);
                event.locals = emptySession;
            }
        }
    }
    console.debug(`Authorization: ${performance.now() - now}ms`);

    const isMain = event.url.pathname === "/";
    if (isMain) {
        const result = await resolve(event, {
            transformPageChunk: ({ html }) => html,
        });
        return result;
    }

    const isApiAuth = event.url.pathname === "/api/auth";
    const isAuth = event.url.pathname === "/auth";
    if (!isAuth && !isApiAuth && !event.locals.userId) {
        throw redirect(303, "/");
    }
    if (isAuth && event.locals.userId) {
        throw redirect(303, "/");
    }

    const result = await resolve(event, {
        transformPageChunk: ({ html }) => html,
    });
    return result;
};
