import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto, RegisterUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User as UserM, UserDocument } from './schemas/user.schema';
import mongoose, { Model } from 'mongoose';
import { genSaltSync, hashSync, compareSync } from 'bcryptjs';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from './users.interface';
import { User } from 'src/auth/decorator/customize';
import aqp from 'api-query-params';
import { Role, RoleDocument } from 'src/roles/schema/role.schema';
import { ADMIN_ROLE, USER_ROLE } from 'src/databases/sample';
import axios from 'axios';
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserM.name) private userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Role.name) private roleModel: SoftDeleteModel<RoleDocument>,
  ) {}

  getHashPassword = (password: string) => {
    const salt = genSaltSync(10);
    const hash = hashSync(password, salt);
    return hash;
  };

  async create(createUserDto: CreateUserDto, @User() user: IUser) {
    const isExist = await this.userModel.findOne({
      email: createUserDto.email,
    });
    if (isExist) {
      throw new BadRequestException(`Email ${createUserDto.email} đã tồn tại`);
    }

    const hashPassword = this.getHashPassword(createUserDto.password);

    const newUser = await this.userModel.create({
      ...createUserDto,
      password: hashPassword,
      createdBy: {
        _id: user?._id,
        email: user?.email,
      },
    });

    return newUser;
  }

  async findAll(currentPage: number, limit: number, qs: string) {
    const { filter, sort, projection, population } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    let offset = (+currentPage - 1) * +limit;
    let defaultLimit = +limit ? +limit : 10;

    const totalItems = (await this.userModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.userModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      // @ts-ignore: Unreachable code error
      .sort(sort)
      .select('-password')
      .populate(population)
      .exec();

    return {
      meta: {
        current: currentPage, //trang hiện tại
        pageSize: limit, //số lượng bản ghi đã lấy
        pages: totalPages, //tổng số trang với điều kiện query
        total: totalItems, // tổng số phần tử (số bản ghi)
      },
      result, //kết quả query
    };
  }

  findOne(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return 'not found user';
    }

    return this.userModel
      .findOne({ _id: id })
      .select('-password')
      .populate({ path: 'role', select: { name: 1, _id: 1 } });
  }

  findOneByUserName(username: string) {
    return this.userModel
      .findOne({ email: username })
      .populate({ path: 'role', select: { name: 1 } });
  }
  // users.service.ts
  findOneByUserNameAndType(username: string, type?: string) {
    const query: any = { email: username };
    if (type) query.type = type; // 👈 THÊM TYPE

    return this.userModel
      .findOne(query)
      .populate({ path: 'role', select: { name: 1 } });
  }

  isValidPassword(password: string, hash: string) {
    return compareSync(password, hash);
  }
  async update(updateUserDto: UpdateUserDto, user: IUser) {
    // 1. Update thông tin user
    const result = await this.userModel.updateOne(
      { _id: updateUserDto._id },
      {
        ...updateUserDto,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );

    // 2. Nếu update thành công → gọi ML server training lại
    try {
      await axios.post('http://127.0.0.1:5000/train');
      console.log('🔥 ML model retrained after user update.');
    } catch (err) {
      console.error('❌ ML training failed:', err.message);
    }

    return result;
  }

  async remove(id: string, @User() user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return 'not found company';
    }
    //khong xóa tài khoản admin
    const foundUser = await this.userModel.findById(id);
    if (foundUser && foundUser.email === 'admin@gmail.com') {
      throw new BadRequestException(
        'Không thể xóa tài khoản gmail admin@gmail.com',
      );
    }
    await this.userModel.updateOne(
      { _id: id },
      {
        deletedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );
    return this.userModel.softDelete({ _id: id });
  }

  async register(user: RegisterUserDto) {
    const { name, email, password, age, gender, address } = user;
    const isExist = await this.userModel.findOne({ email });
    if (isExist) {
      throw new BadRequestException(`Email ${email} đã tồn tại `);
    }
    const userRole = await this.roleModel.findOne({ name: USER_ROLE });

    const hashPassword = this.getHashPassword(password);
    let newRegister = await this.userModel.create({
      name,
      email,
      password: hashPassword,
      age,
      gender,
      address,
      role: userRole?._id,
    });
    return newRegister;
  }
  async registerMedia(type: string, username: string) {
    const isExist = await this.userModel.findOne({
      email: username,
      type: type, // 🔥 CHECK ĐÚNG CẢ TYPE
    });

    if (isExist) {
      throw new BadRequestException(
        `Tài khoản ${username} đã tồn tại với phương thức ${type}`,
      );
    }

    const userRole = await this.roleModel.findOne({ name: ADMIN_ROLE });

    let newRegister = await this.userModel.create({
      password: '',
      name: username,
      email: username,
      role: userRole?._id,
      type: type,
    });
    return newRegister;
  }

  updateUserToken = async (refreshToken: string, _id: string) => {
    const isLogin = !!refreshToken;
    return this.userModel.updateOne(
      { _id },
      {
        $set: {
          refreshToken,
          online: isLogin, // login → true, logout → false
          lastActive: new Date(), // mốc hoạt động gần nhất
        },
      },
    );
  };

  findUserByUser = async (refreshToken: string) => {
    return await this.userModel
      .findOne({ refreshToken })
      .populate({ path: 'role', select: { name: 1 } });
  };

  async getTodayBirthdays() {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    return this.userModel.aggregate([
      {
        $match: {
          birthday: { $ne: null },
          $expr: {
            $and: [
              { $eq: [{ $month: '$birthday' }, todayMonth] },
              { $eq: [{ $dayOfMonth: '$birthday' }, todayDay] },
            ],
          },
        },
      },
      {
        $project: {
          name: 1,
          avatar: 1,
          birthday: 1,
        },
      },
    ]);
  }
  async getAllUserML() {
    const users = await this.userModel
      .find()
      .select('name age gender school address  followersCount followingCount')
      .lean();

    return { users };
  }
}
