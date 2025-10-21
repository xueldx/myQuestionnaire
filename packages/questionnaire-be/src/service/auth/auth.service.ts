import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import User from '@/service/auth/entities/user.entity';
import { Repository } from 'typeorm';
import RegisterUserDto from '@/service/auth/dto/register-user.dto';
import LoginDto from '@/service/auth/dto/login.dto';
import ChangePasswordDto from '@/service/auth/dto/change-password';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  // 创建用户
  async createUser(registerUserDto: RegisterUserDto) {
    const saltRounds = 10;
    registerUserDto.password = await bcrypt.hash(
      registerUserDto.password,
      saltRounds,
    );
    return await this.userRepository.save(registerUserDto);
  }

  // 获取用户信息
  async getUserInfo(email: string) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return {
      nickname: user.nickname,
      email: user.email,
      createTime: user.create_time,
      avatar: user.avatar,
      bio: user.bio,
    };
  }

  // 根据邮箱查询用户
  async findByEmail(email: string) {
    return await this.userRepository.findOne({
      where: { email },
    });
  }

  // 根据用户 id 查询用户
  async findById(userId: number) {
    return await this.userRepository.findOne({
      where: { id: userId },
    });
  }

  // 校验密码
  async comparePassword(loginDto: LoginDto) {
    const user = await this.findByEmail(loginDto.email);
    if (user && (await bcrypt.compare(loginDto.password, user.password))) {
      return true;
    }
    return false;
  }

  // 生成 token
  createToken(data: Record<string, any>) {
    return this.jwtService.sign(data);
  }

  // 注销账户
  async deleteAccount(userId: number) {
    return await this.userRepository.delete(userId);
  }

  // 修改密码
  async changePassword(userId: number, changePasswordDto: ChangePasswordDto) {
    const { oldPassword, newPassword, confirmPassword } = changePasswordDto;
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('新密码与确认密码不一致');
    }
    if (!(await bcrypt.compare(oldPassword, user.password))) {
      throw new BadRequestException('旧密码错误');
    }

    const saltRounds = 10;
    const hashNewPassword = await bcrypt.hash(newPassword, saltRounds);

    return await this.userRepository.update(userId, {
      password: hashNewPassword,
    });
  }
}
