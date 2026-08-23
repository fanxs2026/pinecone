import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  // Optional: the refresh token is normally sent via the httpOnly
  // `pinecone-refresh` cookie; the body field is a fallback for clients
  // that cannot manage cookies (e.g. Swagger).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
