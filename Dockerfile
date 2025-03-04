FROM        denoland/deno:alpine-2.2.2

LABEL       author="Willow (GHOST)"
LABEL       maintainer="ghostdevbusiness@gmail.com"
LABEL       org.opencontainers.image.source="https://github.com/ghostdevv/docker-images"


WORKDIR     /app

COPY        . .

RUN         deno cache src/main.ts

CMD         ["deno", "task", "start"]
