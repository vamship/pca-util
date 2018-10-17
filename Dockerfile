FROM node:8.11.3-alpine

ARG APP_NAME

RUN mkdir -p app/logs

COPY ./dist app/dist
COPY ./.${APP_NAME}rc app/.${APP_NAME}rc
COPY ./package.json app/package.json
COPY ./package-lock.json app/package-lock.json

WORKDIR app

ENV NODE_ENV=production
RUN ["npm", "install", "-g", "."]

ENTRYPOINT ["pca"]
