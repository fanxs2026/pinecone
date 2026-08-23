import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { getEditionBootstrap } from './common/config/edition';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  health() {
    return this.appService.health();
  }

  /**
   * 版本引导信息（公开，无需登录）：前端启动时拉取，决定企业功能入口显隐。
   * 方案依据 edition-isolation-plan：bootstrap 必须公开，否则登录页无法渲染。
   * 注意：这只是「可见性」数据——真正的安全防线是后端 @EnterpriseFeature 403。
   */
  @Public()
  @Get('bootstrap')
  @ApiOperation({ summary: 'Edition bootstrap: edition + enabled enterprise features' })
  bootstrap() {
    return getEditionBootstrap();
  }
}
