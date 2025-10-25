FROM adminer:latest

# Download latest Adminer PHP file dynamically
RUN LATEST_VERSION=$(wget -qO- https://api.github.com/repos/vrana/adminer/releases/latest | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p') && \
    wget https://github.com/vrana/adminer/releases/download/${LATEST_VERSION}/adminer-${LATEST_VERSION#v}.php -O /var/www/html/adminer-latest.php

# Copy plugin base class, custom plugin and index
COPY plugin.php /var/www/html/plugin.php
COPY login-token.php /var/www/html/login-token.php
COPY index.php /var/www/html/index.php
COPY auto-login.php /var/www/html/auto-login.php

# Add environment variable for backend URL
ENV BACKEND_URL=http://backend:8000
