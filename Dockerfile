FROM        denoland/deno:alpine-2.7.14@sha256:f36b916d304948316d9af285dba7949be6e17ed56af8b90b389295bcf4326cba AS build

ARG         GIT_HASH
ENV         GIT_HASH=${GIT_HASH}

WORKDIR     /app
COPY        . .

RUN         deno bundle src/main.ts --output bundle.js --keep-names

FROM        denoland/deno:alpine-2.7.14@sha256:f36b916d304948316d9af285dba7949be6e17ed56af8b90b389295bcf4326cba

LABEL       author="Willow (GHOST)"
LABEL       maintainer="git@willow.sh"
LABEL       org.opencontainers.image.source="https://github.com/ghostdevv/discord-rss"
LABEL       org.opencontainers.image.description="A simple script that will check RSS feeds for updates, and if there are any found publish a discord webhook."
LABEL       org.opencontainers.image.licenses="MIT"

WORKDIR     /app
COPY        --from=build /app/bundle.js .

RUN         deno cache bundle.js

CMD         ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--unstable-kv", "--allow-env", "bundle.js"]
