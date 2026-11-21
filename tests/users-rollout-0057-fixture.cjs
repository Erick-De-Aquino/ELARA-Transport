// Explicit activation for disposable test databases only; never part of installation.
'use strict';
const enableSql=`insert into elara_private.user_admin_rollout(operation,enabled,edge_verified,callback_verified,mail_verified,callback_url)
 select op,true,true,true,true,'https://local.example.invalid/accept-user-invite.html'
 from unnest(array['metadata','status','assign','revoke','invite']) op`;
module.exports={enableSql};
