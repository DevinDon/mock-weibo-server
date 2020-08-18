import { Controller } from '@rester/core';
import { get } from 'superagent';
import { getMongoRepository } from 'typeorm';
import { URL } from 'url';
import { STEP } from '../@constant';
import { AccessEntity } from '../@handler/access.entity';
import { concatResult, insertOneByOne, Result } from '../@util';
import { traversingCursorWithStep } from '../@util/cursor';
import { logger } from '../@util/logger';
import { CommentEntity } from '../comment/comment.entity';
import { Comment } from '../comment/comment.model';
import { StatusEntity } from '../status/status.entity';
import { Status } from '../status/status.model';
import { UserEntity } from '../user/user.entity';
import { User } from '../user/user.model';
import { WeiboEntity } from '../weibo/weibo.entity';

// insert, delete, update, select
// one, more

@Controller()
export class ManageController {

  private async fetchCommentsByStatusID(id: number): Promise<Comment[]> {
    logger.debug(`Fetch comments by status ID ${id}`);
    return get('https://api.weibo.com/2/comments/show.json?access_token=2.00Limi4D7kdwtC6aa1803987GSmw_D&page=1&count=200')
      .query({ id })
      .send()
      .then(response => response.body.comments)
      .catch(reason => (logger.warn(`Fetch comments by status ID ${id} failed: ${JSON.stringify(reason)}`), []));
  }

  async insertCommentsByStatusIDs(ids: number[]) {
    logger.debug(`Save fetch comments by status IDs ${ids}`);
    const results = [];
    for (const id of ids) {
      const comments = await this.fetchCommentsByStatusID(id);
      results.push(await insertOneByOne(comments, CommentEntity.insert.bind(CommentEntity)));
    }
    return results;
  }

  async insertCommentsFromAllStatus() {
    logger.debug('Fetch comments for all statuses');
    const results = [];
    const cursor = getMongoRepository(StatusEntity).createCursor().sort({ $natural: -1 });
    logger.debug('Got cursor of database status');
    while (await cursor.hasNext()) {
      const status: Status = await cursor.next();
      if (status.comments_count === 0) {
        logger.debug(`Status ${status.id} has no comment`);
        continue;
      }
      logger.debug(`Got status: ${status.id}`);
      const comments = await this.fetchCommentsByStatusID(status.id);
      logger.debug(`Got comments: ${comments.length}`);
      const result = await insertOneByOne(comments, CommentEntity.insert.bind(CommentEntity));
      logger.debug(`Got result: ${result.success} / ${result.total}`);
      results.push(result);
    }
    return results;
  }

  async insertCommentsFromNewStatus() {
    logger.debug('Fetch comments for new statuses');
    const results = [];
    const cursor = getMongoRepository(StatusEntity).createCursor().sort({ $natural: -1 });
    logger.debug('Got cursor of database status');
    while (await cursor.hasNext()) {
      const status: Status = await cursor.next();
      if (status.comments_count === 0) {
        logger.debug(`Status ${status.id} has no comment`);
        continue;
      }
      if (await CommentEntity.findOne({ where: { 'status.id': status.id } })) {
        logger.debug(`Status ${status.id} already has comments`);
        continue;
      }
      logger.debug(`Got status: ${status.id}`);
      const comments = await this.fetchCommentsByStatusID(status.id);
      logger.debug(`Got comments: ${comments.length}`);
      const result = await insertOneByOne(comments, CommentEntity.insert.bind(CommentEntity));
      logger.debug(`Insert result: ${result.success} / ${result.total}`);
      results.push(result);
    }
    return results;
  }

  async insertNewStatuses() {
    logger.debug('Fetch new statuses');
    const status = {
      home: await get('https://api.weibo.com/2/statuses/home_timeline.json?&page=1&count=200')
        .query({ access_token: '2.00Limi4DwNCgfEd11accecebGWMpaD' })
        .send()
        .then(response => response.body.statuses),
      public: await get('https://api.weibo.com/2/statuses/public_timeline.json?&page=1&count=200')
        .query({ access_token: '2.00Limi4DwNCgfEd11accecebGWMpaD' })
        .send()
        .then(response => response.body.statuses)
    };
    const results = {
      home: await insertOneByOne(status.home, StatusEntity.insert.bind(StatusEntity)),
      public: await insertOneByOne(status.public, StatusEntity.insert.bind(StatusEntity))
    };
    const result: Result = concatResult(results.home, results.public);
    logger.debug(`Fetch new status: ${result.success} / ${result.total}`);
    return result;
  }

  async insertNewStatusesByIDs(ids: number[]) {
    logger.debug(`Fetch statuses by IDs ${ids}`);
    const pending = ids.map(
      id => get('https://api.weibo.com/2/statuses/show.json')
        .query({ access_token: '2.00Limi4DwNCgfEd11accecebGWMpaD' })
        .query({ id })
        .send()
        .catch(reason => logger.warn(`Fetch status ${id} failed, ${JSON.stringify(reason)}`))
    );
    const statuses: Status[] = (await Promise.all(pending)).filter(status => status) as any;
    const result = await insertOneByOne(statuses, StatusEntity.insert.bind(StatusEntity));
    logger.debug(`Fetch new statuses: ${result.success} / ${result.total}`);
    return result;
  }

  async insertUsersFromComments() {
    logger.debug('Fetch users from comments');
    const results: Result[] = [];
    // let skip = 0;
    // while (skip <= await CommentEntity.count()) {
    //   const users: User[] = [];
    //   const cursor = getMongoRepository(CommentEntity).createCursor().sort({ $natural: -1 }).skip(skip).limit(STEP);
    //   skip += STEP;
    //   while (await cursor.hasNext()) {
    //     const comment: Comment = await cursor.next();
    //     users.push(comment.user);
    //     logger.debug(`Fetch new user: ${comment.user.id}`);
    //   }
    //   results.push(await insertOneByOne(users, UserEntity.insert.bind(UserEntity)));
    //   logger.info(`Cursor step done: ${skip}.`);
    //   await cursor.close();
    // }
    await traversingCursorWithStep({
      createCursor: () => getMongoRepository(CommentEntity).createCursor().sort({ $natural: -1 }),
      loop: async cursor => {
        const users: User[] = [];
        while (await cursor.hasNext()) {
          const comment: Comment = await cursor.next();
          users.push(comment.user);
          logger.debug(`Fetch new user: ${comment.user.id}`);
        }
        results.push(await insertOneByOne(users, UserEntity.insert.bind(UserEntity)));
      }
    });
    const result = concatResult(...results);
    logger.debug(`Fetch new users: ${result.success} / ${result.total}`);
    return result;
  }

  async insertUsersFromStatuses() {
    logger.debug('Fetch users from statuses');
    const users: User[] = [];
    const cursor = getMongoRepository(StatusEntity).createCursor().sort({ $natural: -1 });
    while (await cursor.hasNext()) {
      const status: Status = await cursor.next();
      users.push(status.user);
      logger.debug(`Fetch new user: ${status.user.id}`);
    }
    const result = await insertOneByOne(users, UserEntity.insert.bind(UserEntity));
    logger.debug(`Fetch new users: ${result.success} / ${result.total}`);
    return result;
  }

  async insertAllUsers() {
    const result = concatResult(await this.insertUsersFromComments(), await this.insertUsersFromStatuses());
    logger.debug(`Fetch all users: ${result.success} / ${result.total}`);
    return result;
  }

  async formatAccessLog() {
    const results: { total: number, addresses: string[] } = { total: 0, addresses: [] };
    let skip = 0;
    while (skip <= await AccessEntity.count()) {
      const cursor = getMongoRepository(AccessEntity).createCursor().skip(skip).limit(STEP);
      skip += STEP;
      while (await cursor.hasNext()) {
        const access: AccessEntity = await cursor.next();
        access.date = new Date(access.date || 0);
        const url = new URL('http://mock.don.red' + access.url);
        access.path = url.pathname;
        access.query = Object.fromEntries(url.searchParams.entries());
        AccessEntity.update({ _id: access._id }, access);
        logger.debug(`Access IP is ${access.address}`);
        results.addresses.push(access.address);
      }
      logger.info(`Cursor step done: ${skip}.`);
      await cursor.close();
    }
    logger.info('Format all done.');
    results.total = results.addresses.length;
    return results;
  }

}
