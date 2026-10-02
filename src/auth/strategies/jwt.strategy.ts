import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service.js';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwtSecret') ||
        configService.get<string>('JWT_SECRET') ||
        'tdp-classroom-lite-jwt-secret-key-2025',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }
    /* EMAIL VERIFICATION DISABLED FOR NOW
    if (user.isEmailVerified === false) {
      throw new UnauthorizedException('Please verify your email address to access this resource');
    }
    */
    return {
      id: user.id || (user as any)._id?.toString(),
      email: user.email,
      name: user.name,
      avatar: user.avatar || undefined,
      role: user.role || undefined,
    };
  }
}
