import { error, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { URI_POSTS, URI_USERS } from "$env/static/private";
import type { User__Output } from "$lib/proto/proto/User";
import { createMetadata } from "$lib/metadata";
import { postsClient, usersClient } from "$lib/grpc";
import { z } from "zod";
import type { Post__Output } from "$lib/proto/proto/Post";
import type { PostId } from "$lib/proto/proto/PostId";
import type { Empty } from "$lib/proto/proto/Empty";
import { checkSubscription } from "$lib/apps/stripe";

export const load = (async ({ locals }) => {
    try {
        const start = performance.now();

        const isSub = await checkSubscription(locals.paymentId);
        if (!isSub) {
            return {
                isSubscribed: false,
                posts: [],
                duration: 0,
                stream: {
                    users: Promise.resolve([]),
                },
            };
        }

        const request: Empty = {};
        let metadata = await createMetadata(URI_POSTS);
        const stream = postsClient.getPosts(request, metadata);
        const posts: Post__Output[] = [];

        const userIds = new Set<string>();

        await new Promise<Post__Output[]>((resolve, reject) => {
            stream.on("data", (post: Post__Output) => {
                posts.push(post);
                userIds.add(post.userId);
            });
            stream.on("end", () => resolve(posts));
            stream.on("error", (err: unknown) => reject(err));
        });

        const end = performance.now();

        metadata = await createMetadata(URI_USERS);
        const usersStream = usersClient.getUsers(
            { userIds: Array.from(userIds) },
            metadata,
        );
        const users: User__Output[] = [];
        const usersPromise = new Promise<User__Output[]>((resolve, reject) => {
            usersStream.on("data", (user: User__Output) => users.push(user));
            usersStream.on("end", () => resolve(users));
            usersStream.on("error", (err: unknown) => reject(err));
        });

        return {
            isSubscribed: true,
            posts: posts,
            duration: end - start,
            stream: {
                users: usersPromise,
            },
        };
    } catch (err) {
        console.error(err);
        throw error(500, "Could not load posts");
    }
}) satisfies PageServerLoad;

export const actions = {
    createPost: async ({ locals, request }) => {
        const start = performance.now();

        const form = await request.formData();
        const title = form.get("title");
        const content = form.get("content");

        const data = {
            title: title,
            content: content,
            userId: locals.userId,
        };

        const schema = z
            .object({
                userId: z.string().uuid(),
                title: z.string().min(1).max(100),
                content: z.string().min(1).max(1000),
            })
            .safeParse(data);

        if (!schema.success) {
            return fail(409, { error: schema.error.flatten() });
        }

        try {
            const metadata = await createMetadata(URI_POSTS);
            await new Promise<Post__Output>((resolve, reject) => {
                postsClient.createPost(schema.data, metadata, (err, response) =>
                    err || !response ? reject(err) : resolve(response),
                );
            });

            const end = performance.now();
            return {
                success: true,
                duration: end - start,
            };
        } catch (err) {
            console.error(err);
            throw error(500, "Could not create post");
        }
    },
    deletePost: async ({ locals, request }) => {
        const start = performance.now();

        const form = await request.formData();
        const id = form.get("id");

        const schema = z
            .object({
                id: z.string().uuid(),
            })
            .safeParse({ id: id });
        if (!schema.success) {
            throw error(400, "Missing id");
        }
        try {
            const data: PostId = {
                postId: schema.data.id,
                userId: locals.userId,
            };

            const metadata = await createMetadata(URI_POSTS);
            const post = await new Promise<Post__Output>((resolve, reject) => {
                postsClient.deletePost(data, metadata, (err, response) =>
                    err || !response ? reject(err) : resolve(response),
                );
            });

            const end = performance.now();
            return {
                post: post,
                duration: end - start,
            };
        } catch (err) {
            console.error(err);
            throw error(500, "Failed to delete post");
        }
    },
} satisfies Actions;
