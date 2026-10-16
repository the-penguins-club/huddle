FROM node:22-alpine

WORKDIR /app
COPY server.js index.html ./

# Rooms persist here. Created and owned by the unprivileged user *before* VOLUME, so a fresh
# named volume inherits that ownership and the server can write to it.
RUN mkdir /data && chown node:node /data
# LAN_INFO=0: the container's own addresses mean nothing to anyone outside it.
ENV HOST=0.0.0.0 PORT=8765 DATA_FILE=/data/rooms.json LAN_INFO=0
VOLUME /data
USER node
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/info').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server.js"]
