import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import RegisterUserDto from './dto/register-user.dto';
import LoginDto from './dto/login.dto';
import ChangePasswordDto from './dto/change-password';
import { ResponseBody } from '@/common/classes/response-body';
import { UserToken } from '@/common/decorators/current-user.decorator';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            createUser: jest.fn(),
            findByEmail: jest.fn(),
            comparePassword: jest.fn(),
            createToken: jest.fn(),
            getUserInfo: jest.fn(),
            changePassword: jest.fn(),
            deleteAccount: jest.fn(),
          },
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });

  it('should register a user', async () => {
    const registerUserDto: RegisterUserDto = {
      email: 'test@example.com',
      password: 'password123',
      nickname: 'TestUser',
    };

    jest.spyOn(authService, 'findByEmail').mockResolvedValue(null);

    const result = await authController.register(registerUserDto);
    expect(result).toEqual(new ResponseBody<null>(1, null, '注册成功'));
  });

  it('should not register a user if email already exists', async () => {
    const registerUserDto: RegisterUserDto = {
      email: 'test@example.com',
      password: 'password123',
      nickname: 'TestUser',
    };

    const user = {
      id: 1,
      email: registerUserDto.email,
      password: registerUserDto.password,
      nickname: registerUserDto.nickname,
      create_time: new Date(),
      avatar: 'default-avatar.webp',
      bio: '',
      favorites: [],
    };

    jest.spyOn(authService, 'findByEmail').mockResolvedValue(user as any);

    const result = await authController.register(registerUserDto);
    expect(result).toEqual(new ResponseBody<null>(0, null, '该邮箱已注册'));
  });

  it('should login a user', async () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    const user = {
      id: 1,
      email: 'test@example.com',
      password: 'hashedPassword',
      nickname: 'TestUser',
      create_time: new Date(),
      avatar: 'avatar.webp',
      bio: 'Test bio',
      favorites: [],
    };

    jest.spyOn(authService, 'findByEmail').mockResolvedValue(user as any);
    jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);
    jest.spyOn(authService, 'createToken').mockReturnValue('test-token');

    const result = await authController.login(loginDto);
    expect(result).toEqual(
      new ResponseBody(
        1,
        {
          token: 'test-token',
          userInfo: {
            userId: user.id,
            avatar: user.avatar,
            nickname: user.nickname,
          },
        },
        '登录成功',
      ),
    );
  });

  it('should get user info', async () => {
    const userToken: UserToken = {
      userId: 1,
      email: 'test@example.com',
      password: 'hashedPassword',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    };

    const userInfo = {
      nickname: 'TestUser',
      email: 'test@example.com',
      createTime: new Date(),
      avatar: 'avatar.webp',
      bio: 'Test bio',
    };

    jest.spyOn(authService, 'getUserInfo').mockResolvedValue(userInfo as any);

    const result = await authController.getUserInfo(userToken);
    expect(result).toEqual(
      new ResponseBody(1, { userInfo }, '获取用户信息成功'),
    );
  });

  it('should change password', async () => {
    const userToken: UserToken = {
      userId: 1,
      email: 'test@example.com',
      password: 'hashedPassword',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    };

    const dto: ChangePasswordDto = {
      oldPassword: 'password123',
      newPassword: 'newPass123',
      confirmPassword: 'newPass123',
    };

    jest.spyOn(authService, 'changePassword').mockResolvedValue({} as any);

    const result = await authController.changePassword(userToken, dto);
    expect(result).toEqual(new ResponseBody<null>(1, null, '密码修改成功'));
  });
});
