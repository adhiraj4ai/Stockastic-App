class MLRouter:
    """
    A router to control all database operations on models in the
    stock_market database.
    """
    route_models = {'dailystockprice'}

    def db_for_read(self, model, **hints):
        """
        Attempts to read stock market models from stock_market.
        """
        if model._meta.model_name in self.route_models:
            return 'stock_market'
        return None

    def db_for_write(self, model, **hints):
        """
        Attempts to write stock market models to stock_market.
        """
        if model._meta.model_name in self.route_models:
            return 'stock_market'
        return None

    def allow_relation(self, obj1, obj2, **hints):
        """
        Allow relations if involved models are in the route_models set.
        """
        if (
            obj1._meta.model_name in self.route_models or
            obj2._meta.model_name in self.route_models
        ):
           return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        Make sure the models in route_models are only in the 'stock_market' database.
        """
        if model_name in self.route_models:
            return db == 'stock_market'
        return None
