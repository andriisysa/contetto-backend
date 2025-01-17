FROM node:20-alpine

RUN apk --no-cache add ttf-dejavu

WORKDIR /app

COPY package*.json  ./

RUN npm i

COPY . .

RUN npm run build

EXPOSE 80

CMD npm run start