import { GET, HTTP400Exception, Inject, PUT, RequestBody, View, PathQuery } from '@rester/core';
import { ManageController } from './manage.controller';

// add, remove, modify, find(condition), get(random)
// one, more

@View('weibo/manage')
export class ManageView {

  @Inject()
  private controller!: ManageController;

  @PUT('comment')
  async fetchCommentsByStatusIDs(
    @RequestBody() { ids }: { ids: number[] } = { ids: [] }
  ) {
    if (!ids || !ids.length) { throw new HTTP400Exception('request body ids is required'); }
    ids = ids.map(id => +id).filter(id => id);
    return this.controller.insertCommentsByStatusIDs(ids);
  }

  @PUT('comment/all')
  async fetchCommentsForAllStatuses() {
    return this.controller.insertCommentsForStatuses({ overwrite: true, reverse: false });
  }

  @PUT('comment/new')
  async fetchCommentsForNewStatuses() {
    return this.controller.insertCommentsForStatuses({ reverse: true });
  }

  @PUT('status')
  async fetchNewStatusesByIDs(
    @RequestBody() { ids }: { ids: number[] } = { ids: [] }
  ) {
    if (!ids || !ids.length) { throw new HTTP400Exception('request body ids is required'); }
    return this.controller.insertNewStatusesByIDs(ids);
  }

  @PUT('status/new')
  async fetchNewStatuses() {
    return this.controller.insertNewStatuses();
  }

  @PUT('user/all')
  async fetchAllUsersFromLocal() {
    return this.controller.insertAllUsers();
  }

  @PUT('access')
  async formatAccessLog() {
    return this.controller.updateFormatAccessLog();
  }

  @PUT('token')
  async updateAccessToken(
    @PathQuery('token') token: string
  ) {
    // if (!token) { throw new HTTP400Exception('param `token` is required'); }
    this.controller.token = token || '2.00Limi4DwNCgfEd11accecebGWMpaD';
    return { token };
  }

  @GET('test')
  async test() {
    return this.controller.test();
  }

}
