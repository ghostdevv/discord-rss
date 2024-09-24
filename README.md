# Discord RSS

A simple script that will check RSS feeds for updates, and if there are any found publish a discord webhook.

## Setup

You can run it in docker using the [docker-compose](./docker-compose.yml) file. Here are the steps I followed:

1. Create a folder to house everything in

```bash
mkdir discord-rss
```

2. Create your `config.json`

The contents should look something like this:

```json
{
    "feeds": [],
    "webhooks": []
}
```

3. Copy the docker-compose.yml

```bash
wget https://raw.githubusercontent.com/ghostdevv/discord-rss/refs/heads/main/docker-compose.yml
```

4. Start the script

```bash
docker compose up -d
```
