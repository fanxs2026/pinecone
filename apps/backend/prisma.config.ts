import { config } from 'dotenv';
import { defineConfig } from '@prisma/config';

// 找不到 .env 时静默（CI 等无 .env 环境）
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // 缺省给占位值：prisma generate 不连库，但空字符串会让 prisma 报错
    // （本地/生产通过 .env 注入真实连接串）
    url: process.env.DATABASE_URL || 'postgresql://pinecone_admin:pinecone@localhost:5432/pinecone',
    directUrl: process.env.DIRECT_URL || '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || '',
  },
});
