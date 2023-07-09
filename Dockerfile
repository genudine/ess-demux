FROM oven/bun
WORKDIR /app
COPY . .
RUN bun i && bun build ./index.ts --outdir ./build --minify
CMD ["bun", "run", "build/index.js"]