FROM denoland/deno:alpine

WORKDIR /app

COPY . .
RUN deno cache src/main.ts

CMD ["deno", "task", "start"]
