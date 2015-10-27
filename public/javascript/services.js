/**
 * Created by jorgelima on 10/26/15.
 */

angular.module('collabYoutube.services', [])

    .factory('$socket', function (socketFactory) {
        return socketFactory();
    })

    .service('$session', function(){
        var user_;

        this.setUser = function(user){
            user_ = user;
        }

        this.getUser = function(){
            if(user_ != null){
                return user_;
            }
            else
            return null;
        }
    })

    .service('collab', function($socket){

        this.join = function(){

        }

    })